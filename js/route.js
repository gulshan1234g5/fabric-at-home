// FabricAtHome — route: exact road distance & ETA via OSRM (OpenStreetMap).
//
// Uber/Rapido-style accuracy = ROAD-SURFACE distance, not crow-flies:
//   * OSRM routes on the real OpenStreetMap road network. Free, no API key.
//   * We use the OSRM *Table* service — ONE HTTP call from your origin to ALL
//     visible showrooms returns the full distance+duration matrix. A ride app
//     does the same (a matrix per screen), instead of N separate calls that
//     hammer the shared demo servers and get throttled.
//   * `fallback_speed=20` fills any unroutable row with a mesh-estimate rather
//     than a null, so a card is never blank.
//
// Hosts (ordered, both free OSRM, CORS open):
//   1. routing.openstreetmap.de/routed-car   — stable, verified matrix+route
//   2. router.project-osrm.org               — popular public demo, flakier
//   Rotation: first Ok wins for the whole call; full outage → estimates.
//
// Honest sources:
//   * "osrm"      — exact, from the road network.
//   * "estimate"  — haversine×1.3 + 20 km/h, shown instantly, swapped in place.
//     Never cached for long (15 min) so a recovered OSRM is picked back up.

(function () {
  "use strict";

  const OSRM_HOSTS = [
    "https://routing.openstreetmap.de/routed-car",
    "https://router.project-osrm.org"
  ];
  const TIMEOUT_MS = 8000;
  const MIN_INTERVAL_MS = 300;          // ≤ ~3 matrix calls/sec
  const ROAD_FACTOR = 1.3;
  const AVG_SPEED_KMH = 20;
  const CACHE_KEY = "fah.route.v2";
  const CACHE_TTL = 6 * 3600 * 1000;    // exact results, mostly static coords
  const EST_TTL = 15 * 60 * 1000;       // fallback rows: short, recover quickly

  const cache = new Map();              // pairKey -> {distanceM,durationS,source,ts}
  const inflight = new Map();           // callKey -> Promise (dedupe)
  let lastFire = 0;

  // ---- persistence ---------------------------------------------------------

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      const now = Date.now();
      Object.keys(obj).forEach((k) => {
        const r = obj[k];
        if (r && typeof r.distanceM === "number") {
          const ttl = r.source === "osrm" ? CACHE_TTL : EST_TTL;
          if (now - r.ts < ttl) cache.set(k, r);
        }
      });
    } catch (e) {}
  }
  function saveCache() {
    try {
      const now = Date.now();
      const out = {};
      cache.forEach((r, k) => {
        const ttl = r.source === "osrm" ? CACHE_TTL : EST_TTL;
        if (now - r.ts < ttl) out[k] = r;
      });
      localStorage.setItem(CACHE_KEY, JSON.stringify(out));
    } catch (e) {}
  }

  // ---- keys -----------------------------------------------------------------

  function pairKey(aLat, aLng, bLat, bLng) {
    return [aLat.toFixed(4), aLng.toFixed(4), bLat.toFixed(4), bLng.toFixed(4)].join(",");
  }
  function callKey(origin, vendors) {
    return "m:" + origin.lat.toFixed(4) + "," + origin.lng.toFixed(4) + "|" +
      vendors.map((v) => v.lat.toFixed(4) + "," + v.lng.toFixed(4)).join(";");
  }

  // ---- estimate (instant fallback) -----------------------------------------

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

  // ---- OSRM table fetch (one call for all vendors) --------------------------

  function fetchTable(origin, vendors) {
    const ankers = vendors.map((v) => v.lng.toFixed(6) + "," + v.lat.toFixed(6));
    const coords = origin.lng.toFixed(6) + "," + origin.lat.toFixed(6) + ";" + ankers.join(";");
    const destIdx = vendors.map((_, i) => i + 1).join(";");
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastFire));

    const chain = new Promise((resolve) => {
      const attempt = (i) => {
        if (i >= OSRM_HOSTS.length) { resolve(null); return; }
        const url = OSRM_HOSTS[i] + "/table/v1/driving/" + coords +
          "?sources=0&destinations=" + destIdx +
          "&annotations=distance,duration&fallback_speed=" + AVG_SPEED_KMH;
        if (typeof fetch !== "function") { resolve(null); return; }
        const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
        fetch(url, { method: "GET", cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
          .then((res) => (res.ok ? res.json() : null))
          .then((j) => {
            if (j && j.code === "Ok" && Array.isArray(j.distances) && j.distances[0]) {
              const dists = j.distances[0] || [];
              const durs = (j.durations && j.durations[0]) || [];
              resolve({ dists, durs, host: OSRM_HOSTS[i] });
            } else {
              attempt(i + 1);
            }
          })
          .catch(() => attempt(i + 1))
          .then(() => { if (timer) clearTimeout(timer); });
      };
      if (wait > 0) setTimeout(() => attempt(0), wait); else attempt(0);
    });
    return chain.then((res) => { lastFire = Date.now(); return res; });
  }

  // ---- public: matrix (primary UI path) -------------------------------------

  // origin: {lat,lng}; vendors: [{lat,lng}, ...]. Resolves an array aligned to
  // `vendors` with entries: {distanceM,durationS,source}. Caller shows exact
  // instantly because the cache is filled from the single matrix response.
  function table(origin, vendors) {
    if (!origin || typeof origin.lat !== "number") return Promise.resolve([]);
    const list = vendors.filter((v) => typeof v.lat === "number");
    if (!list.length) return Promise.resolve([]);
    const ck = callKey(origin, list);
    if (inflight.has(ck)) return inflight.get(ck);

    const p = (async () => {
      const rows = list.map((v) => {
        const pk = pairKey(origin.lat, origin.lng, v.lat, v.lng);
        const hit = cache.get(pk);
        if (hit) return hit;
        return estimate(origin.lat, origin.lng, v.lat, v.lng);
      });
      // If every row is already known (cached), skip the network entirely.
      if (rows.every((r) => r.source === "osrm")) return rows;

      const fetched = await fetchTable(origin, list);
      if (!fetched) return rows; // full outage → keep estimates

      return list.map((v, i) => {
        const dist = fetched.dists[i], dur = fetched.durs[i];
        const pk = pairKey(origin.lat, origin.lng, v.lat, v.lng);
        if (typeof dist === "number" && typeof dur === "number" && isFinite(dist) && dist > 0) {
          const r = {
            distanceM: Math.max(50, Math.round(dist)),
            durationS: Math.max(30, Math.round(dur)),
            source: "osrm",
            ts: Date.now()
          };
          cache.set(pk, r);
          return r;
        }
        const est = rows[i];
        cache.set(pk, est);            // mesh/estimate for that row
        return est;
      });
    })().then((rows) => { saveCache(); return rows; });

    inflight.set(ck, p);
    p.finally(() => inflight.delete(ck)).catch(() => {});
    return p;
  }

  // ---- per-pair route (showroom hero + safety net) ---------------------------
  // Prefers the cache (which the matrix fills); only if a pair was never
  // touched does it run a tiny single-source table call.
  function route(aLat, aLng, bLat, bLng) {
    const pk = pairKey(aLat, aLng, bLat, bLng);
    const hit = cache.get(pk);
    if (hit) return Promise.resolve(hit);
    return table({ lat: aLat, lng: aLng }, [{ lat: bLat, lng: bLng }]).then((rows) =>
      rows[0] ||
      estimate(aLat, aLng, bLat, bLng));
  }

  function peek(lat, lng, origin) {
    if (!origin || typeof lat !== "number" || typeof lng !== "number") return null;
    return cache.get(pairKey(origin.lat, origin.lng, lat, lng)) || null;
  }

  function subscribe(cb) { subs.add(cb); return () => subs.delete(cb); }
  const subs = new Set();
  function notify() { subs.forEach((cb) => { try { cb(); } catch (e) {} }); }
  function status() {
    let osrm = 0, est = 0;
    cache.forEach((r) => { if (r.source === "osrm") osrm++; else est++; });
    return { cached: cache.size, osrm, est, inFlight: inflight.size };
  }

  // ---- display helpers -------------------------------------------------------

  function fmtDistance(m) {
    if (m < 1000) return Math.round(m) + " m";
    return (m / 1000).toFixed(1) + " km";
  }
  function fmtEta(s, min) {
    const mins = Math.max(min || 1, Math.ceil(s / 60));
    return "~" + mins + " min";
  }

  if (typeof localStorage !== "undefined") loadCache();

  window.FAHRoute = { table, route, peek, subscribe, status, fmtDistance, fmtEta, estimate, key: pairKey };
})();