// FabricAtHome — geo: real GPS + haversine distance + ETA + location state.
// navigator.geolocation requires a SECURE context (https) or localhost —
// that's why it silently no-ops on file://. We always ship a graceful
// fallback (DEFAULT_PLACE) plus a manual area override so the app keeps
// working everywhere.

(function () {
  "use strict";

  const STORE_KEY = "fah.geo.v2";
  const ROAD_FACTOR = 1.3;      // urban road distance ≈ 1.3 × straight-line
  const AVG_SPEED_KMH = 20;     // moped in-city ETA assumption

  // state: { status: 'off'|'locating'|'live'|'denied'|'fallback', ... }
  let current = load();
  let manual = null; // { label } from the Change picker override
  const listeners = [];

  // ---- persistence ---------------------------------------------------------

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function save(loc) {
    current = loc;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(loc)); } catch (e) {}
  }

  function status() {
    if (!current) return "off";
    return current.denied ? "denied" : "live";
  }
  function placeLabel() {
    if (manual && manual.label) return manual.label;
    if (current && current.label) return current.label;
    return (typeof FAH !== "undefined" && FAH.DEFAULT_PLACE) ? FAH.DEFAULT_PLACE.label : "Your location";
  }

  // ---- distance & ETA ------------------------------------------------------

  function haversineKm(aLat, aLng, bLat, bLng) {
    const R = 6371;
    const dLat = (bLat - aLat) * Math.PI / 180;
    const dLng = (bLng - aLng) * Math.PI / 180;
    const la = aLat * Math.PI / 180;
    const lb = bLat * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function origin() {
    if (current && !current.denied) return { lat: current.lat, lng: current.lng };
    const d = (typeof FAH !== "undefined" && FAH.DEFAULT_PLACE) || { lat: 12.9352, lng: 77.6245 };
    return { lat: d.lat, lng: d.lng };
  }

  function distanceToVendor(v) {
    const o = origin();
    if (typeof v.lat === "number" && typeof v.lng === "number") {
      return haversineKm(o.lat, o.lng, v.lat, v.lng) * ROAD_FACTOR;
    }
    return v.distanceKm || 0; // vendor without coords → keep seed estimate
  }

  function minsAwayTo(v) {
    const km = distanceToVendor(v);
    return Math.max(5, Math.round(km / AVG_SPEED_KMH * 60));
  }

  function sortedShowrooms() {
    if (typeof FAH === "undefined") return [];
    return [...FAH.vendors].sort((a, b) => distanceToVendor(a) - distanceToVendor(b));
  }

  function live() { return status() === "live"; }

  // ---- GPS request ---------------------------------------------------------

  function request(onChange) {
    if (typeof onChange === "function") listeners.push(onChange);
    if (!("geolocation" in navigator)) {
      set({ denied: true, reason: "unsupported-context" }); // file:// or insecure
      return;
    }
    notify({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          denied: false,
          at: Date.now()
        };
        save(loc);
        reverseGeocode(loc);           // best-effort; label fills in later
        notify({ status: "live", lat: loc.lat, lng: loc.lng });
      },
      (err) => {
        set({ denied: true, reason: err && err.code === 1 ? "permission" : "error" });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }

  function set(loc) { save(loc); notify({ status: status() }); }

  // ---- manual area override (the "Change" picker) --------------------------
  // PREDEFINED_AREAS: lat/lng + label per Bengaluru cluster. Picking one sets
  // a virtual origin so discovery/distance stay correct even without GPS.
  const PREDEFINED_AREAS = [
    { label: "Koramangala", lat: 12.9352, lng: 77.6245 },
    { label: "Indiranagar", lat: 12.9719, lng: 77.6412 },
    { label: "Jayanagar",  lat: 12.9308, lng: 77.5832 },
    { label: "HSR Layout", lat: 12.9118, lng: 77.6410 }
  ];

  function setManualArea(label) {
    const a = PREDEFINED_AREAS.find((x) => x.label === label);
    if (!a) return;
    manual = { label: a.label };
    save({ lat: a.lat, lng: a.lng, denied: false, manual: true, at: Date.now() });
    notify({ status: "live", manual: true });
  }

  function clearManual() { manual = null; }
  function predefinedAreas() { return PREDEFINED_AREAS.map((x) => x.label); }

  // ---- reverse geocode (free, no key, best-effort) -------------------------
  // BigDataCloud client endpoint: CORS-friendly, free, returns locality/city.
  // Failure → keep generic label; never blocks the main flow.
  function reverseGeocode(loc) {
    if (typeof fetch !== "function" || loc.manual) return;
    const url =
      "https://api.bigdatacloud.net/data/reverse-geocode-client?" +
      "latitude=" + loc.lat.toFixed(5) + "&longitude=" + loc.lng.toFixed(5) +
      "&localityLanguage=en";
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        const label = [d.city || d.locality || d.principalSubdivision || null]
          .filter(Boolean).join(", ");
        if (label) {
          const c = { ...loc, label };
          save(c);
          notify({ status: "live", label });
        }
      })
      .catch(() => {});
  }

  function notify(payload) {
    listeners.forEach((fn) => { try { fn(payload); } catch (e) {} });
  }

  window.FAHGeo = {
    request,
    refresh: request,
    status,
    placeLabel,
    origin,
    distanceToVendor,
    minsAwayTo,
    sortedShowrooms,
    haversineKm,
    live,
    predefinedAreas,
    setManualArea,
    clearManual
  };
})();