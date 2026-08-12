// FabricAtHome — route module test (OSRM Table mocked), run with node.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let mem = {};
global.window = {};
global.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
};

// Mock OSRM Table: distances[]/durations[] aligned to destination count.
let hits = 0;
let failPrimary = false;   // first host (routing.openstreetmap.de) down
let failAll = false;       // total outage -> estimates
const hostsHit = [];
const DIST_BY_DEST = { 1: 2447, 2: 5717, 3: 6328, 4: 4773 };
const DUR_BY_DEST = { 1: 175.8, 2: 400.7, 3: 582.8, 4: 376.8 };
global.fetch = (url) => {
  hits++;
  const isBackup = url.startsWith("https://router.project-osrm.org");
  hostsHit.push(isBackup ? "backup" : "primary");
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (failAll) { reject(new Error("full outage")); return; }
      if (failPrimary && !isBackup) { failPrimary = false; reject(new Error("primary 504")); return; }
      const dests = (url.match(/destinations=([0-9;]+)/) || [null, "1"])[1].split(";");
      const distances = [dests.map((d) => DIST_BY_DEST[d] || 1000 + +d)];
      const durations = [dests.map((d) => DUR_BY_DEST[d] || 60 + +d)];
      resolve({ ok: true, json: () => Promise.resolve({ code: "Ok", distances, durations }) });
    }, 10);
  });
};

vm.runInThisContext(fs.readFileSync(path.join(__dirname, "js", "route.js"), "utf8"));
const R = window.FAHRoute;

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log("  PASS", label); }
  else { fail++; console.log("  FAIL", label); }
}

(async () => {
  const A = { lat: 12.9345, lng: 77.6161 };   // Thar Interior Studio
  const B = { lat: 12.9352, lng: 77.6245 };   // default (Koramangala)

  console.log("— table(): ONE call for many vendors —");
  const vendors = [
    { lat: 12.9719, lng: 77.6412 },   // Indiranagar
    { lat: 12.9308, lng: 77.5832 },   // Jayanagar
    { lat: 12.9118, lng: 77.6410 }    // HSR
  ];
  const rows = await R.table(A, vendors);
  const hitsAfterTable = hits;
  ok(rows.length === 3, "one row per vendor, aligned");
  ok(rows.every((r) => r.source === "osrm" && r.distanceM > 0 && r.durationS > 0), "all exact from table");
  ok(hitsAfterTable === 1, "ONE network call for all vendors (rate-limit friendly)");
  ok(rows[0].distanceM === DIST_BY_DEST[1], "matrix distance matched mock");

  console.log("— cache/dedupe across views —");
  const hitsBefore = hits;
  const again = await R.table(A, vendors);
  ok(hits === hitsBefore, "re-prime hits cache, no network");
  ok(again.map((r) => r.source).every((s) => s === "osrm"), "cached rows stay exact");
  ok(rows[0].distanceM === again[0].distanceM, "identical values from cache");

  console.log("— per-pair route() uses the same path —");
  const r1 = await R.route(A.lat, A.lng, B.lat, B.lng);
  ok(r1.distanceM === DIST_BY_DEST[1] && r1.source === "osrm", "pair route resolved exact");

  console.log("— host rotation (first host down → backup exact) —");
  failPrimary = true;
  const r4 = await R.route(B.lat, B.lng, A.lat, A.lng);
  ok(r4.source === "osrm" && r4.distanceM === DIST_BY_DEST[1], "backup host returned exact after primary 504");
  ok(hostsHit.filter((h) => h === "primary").length >= 1 && hostsHit.filter((h) => h === "backup").length >= 1,
    "both hosts attempted in rotation");

  console.log("— honest fallback (full outage → estimates) —");
  failAll = true;
  const FRESH = { lat: 12.9410, lng: 77.6010 };  // never-used pair → no cache
  const r3 = await R.route(FRESH.lat, FRESH.lng, B.lat, B.lng);
  failAll = false;
  ok(r3.source === "estimate", "estimated source when every OSRM host fails");
  ok(r3.distanceM > 0 && r3.durationS > 0, "estimate has sane numbers");

  console.log("— formatting (ride-app style) —");
  ok(R.fmtDistance(2447) === "2.4 km", "km rounded to 1 decimal");
  ok(R.fmtDistance(850) === "850 m", "sub-km shown in metres");
  ok(R.fmtEta(175.8) === "~3 min", "ETA ceil to minutes");
  ok(R.fmtEta(61) === "~2 min", "1m01s → ~2 min (ceiling)");

  console.log("— persistence —");
  const persisted = Object.keys(JSON.parse(mem["fah.route.v2"] || "{}")).length;
  ok(persisted > 0, "route cache persisted to localStorage");
  ok(R.status().osrm > 0, "status counts exact osrm rows");

  console.log("\n%d passed, %d failed", pass, fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });