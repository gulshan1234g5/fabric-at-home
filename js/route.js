// FabricAtHome — route: exact road distance & ETA via OSRM (OpenStreetMap).
//
// Uber/Rapido-style accuracy means ROAD-SURFACE distance, not crow-flies:
//   * OSRM public demo server (router.project-osrm.org) routes on the real
//     OpenStreetMap road network — no API key, CORS open (`*`), free.
//   * Response gives `distance` (m) + `duration` (s) on the fastest driving
//     route → we render "2.4 km · ~5 min away" exactly like a ride app.
//
// Honest degrade chain:
//   1) OSRM route   — exact (fastest path on road network)
//   2) cache        — session memory + localStorage (coords are static per vendor)
//   3) haversine×road-factor — instant estimate shown while routing resolves
//
// Politeness: single in-flight per key, min interval between OSRM hits,
// ~7s AbortController timeout, and source is always labelled (osrm|estimate)
// so the UI never claims a "verified" figure it doesn't have.

(function () {
  "use strict";

  const OSRM_HOSTS = [
    "https://router.project-osrm.org",
    "https://routing.openstreetmap.de/routed-car"
  ];
  const TIMEOUT_MS = 7000;
  const MIN_INTERVAL_MS = 250;          // ≤4 hits/sec on the shared demo server
  const ROAD_FACTOR = 1.3;              // estimate-only fallback
  const AVG_SPEED_KMH = 20;             // moped in-city, estimate-only
  const CACHE_KEY = "fah.route.v1";
  const CACHE_TTL = 6 * 3600 * 1000;    // roads change slowly; 6h is plenty

  const cache = new Map();              // key -> {distanceM,durationS,source,ts}
  const inflight = new Map();           // key -> Promise (dedupe)
  const subs = new Set();
  let lastFire = 0;
  let loaded = false;

  // ---- persistence of the route cache -------------------------------------

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      const now = Date.now();
      for (const k in obj) {
        const r = obj[k];
        if (r && typeof r.distanceM === "number" && (now - r.ts) < CACHE_TTL) cache.set(k, r);
      }
    } catch (e) {}
  }
  function saveCache() {
    try {
      const now = Date.now();
      const out = {};
      cache.forEach((r, k) => { if ((now - r.ts) < CACHE_TTL) out[k] = r; });
      localStorage.setItem(CACHE_KEY, JSON.stringify(out));
    } catch (e) {}
  }

  // ---- keying (3-decimal rounding ≈ 110 m grid; small grid-delta is fine) ---

  function key(aLat, aLng, bLat, bLng) {
    return [aLat.toFixed(3), aLng.toFixed(3), bLat.toFixed(3), bLng.toFixed(3)].join(",");
  }

  // ---- haversine (estimate fallback) ---------------------------------------

  function haversineKm(aLat, aLng, bLat, bLng) {
    const R = 6371, dLat = (bLat - aLat) * Math.PI / 180, dLng = (bLng - aLng) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function estimate(aLat, aLng, bLat, bLng) {
    const km = haversineKm(aLat, aLng, bLat, bLng) * ROAD_FACTOR;
    return {
      distanceM: Math.max(50, Math.round(km * 1000)),
      durationS: Math.max(300, Math.round(km / AVG_SPEED_KMH * 3600)),
      source: "estimate",
      ts: Date.now()
    };
  }

  // -- OSRM fetch with host rotation ---------------------------------------
  // The public demo server is shared and can throttle/504 (esp. mobile IPs).
  // Try each host in order for the SAME pair; first Ok route wins. On a full
  // failure the caller falls back to the estimate path (labelled "estimate").
  function fetchOsrm(aLat, aLng, bLat, bLng) {
    const coords = aLng.toFixed(6) + "," + aLat.toFixed(6) + ";" + bLng.toFixed(6) + "," + bLat.toFixed(6);
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastFire));

    const chain = new Promise((resolve) => {
      const attempt = (i) => {
        if (i >= OSRM_HOSTS.length) { resolve(null); return; }
        const url = OSRM_HOSTS[i] + "/route/v1/driving/" + coords +
          "?overview=false&steps=false&annotations=false";
        if (typeof fetch !== "function") { resolve(null); return; }
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
        fetch(url, { method: "GET", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
          .then((res) => res.ok ? res.json() : null)
          .then((j) => {
            if (j && j.code === "Ok" && j.routes && j.routes[0]) {
              const r = j.routes[0];
              return resolve({
                distanceM: Math.max(50, Math.round(r.distance)),
                durationS: typeof r.duration === "number" ? r.duration : Math.max(300, Math.round(r.distance / 1000 / AVG_SPEED_KMH * 3600)),
                source: "osrm",
                host: OSRM_HOSTS[i],
                ts: Date.now()
              });
            }
            // Ok-code absent → try next host
            attempt(i + 1);
          })
          .catch(() => attempt(i + 1))           // network/abort → next host
          .then(() => { if (timer) clearTimeout(timer); });
      };
      if (wait > 0) setTimeout(() => attempt(0), wait); else attempt(0);
    });
    return chain.then((res) => { lastFire = Date.now(); return res; });
  }

  // ---- public: resolve a route (cache → OSRM → estimate) -------------------

  function route(aLat, aLng, bLat, bLng) {
    if (typeof aLat !== "number" || typeof aLng !== "number" ||
        typeof bLat !== "number" || typeof bLng !== "number") {
      return Promise.resolve(estimate(aLat || 0, aLng || 0, bLat || 0, bLng || 0));
    }
    const k = key(aLat, aLng, bLat, bLng);
    if (cache.has(k)) return Promise.resolve(cache.get(k));
    if (inflight.has(k)) return inflight.get(k);

    const p = fetchOsrm(aLat, aLng, bLat, bLng).then((exact) => {
      const r = exact || estimate(aLat, aLng, bLat, bLng);
      cache.set(k, r);
      saveCache();
      notify();
      return r;
    });
    inflight.set(k, p);
    p.finally(() => inflight.delete(k)).catch(() => {});
    return p;
  }

  // Snapshot a vendor's route from the cache only (never triggers network),
  // so re-renders read the exact value instantly when it's already known.
  function peek(lat, lng, origin) {
    if (!origin || typeof lat !== "number" || typeof lng !== "number") return null;
    const k = key(origin.lat, origin.lng, lat, lng);
    return cache.get(k) || null;
  }

  function subscribe(cb) { subs.add(cb); return () => subs.delete(cb); }
  function notify() { subs.forEach((cb) => { try { cb(); } catch (e) {} }); }
  function status() {
    let osrm = 0;
    cache.forEach((r) => { if (r.source === "osrm") osrm++; });
    return { cached: cache.size, osrm, inFlight: inflight.size };
  }

  // ---- display helpers ------------------------------------------------------

  function fmtDistance(m) {
    if (m < 1000) return Math.round(m) + " m";
    return (m / 1000).toFixed(1) + " km";
  }
  function fmtEta(s, min) {
    const mins = Math.max(min || 1, Math.ceil(s / 60));
    return "~" + mins + " min";
  }

  if (typeof localStorage !== "undefined") loadCache();

  window.FAHRoute = { route, peek, subscribe, status, fmtDistance, fmtEta, estimate, key };
})();