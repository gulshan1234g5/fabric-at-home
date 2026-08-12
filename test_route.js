// FabricAtHome — route module test (OSRM mocked), run with node.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let mem = {};
global.window = {};
global.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
};

// Mock OSRM: same road result regardless of coords; developer controls failure.
let hits = 0;
let failNext = false;
const MOCK_DIST = 2447;     // meters
const MOCK_DUR = 175.8;     // seconds
global.fetch = (url) => {
  hits++;
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (failNext) { failNext = false; reject(new Error("mock network fail")); return; }
      const m = url.match(/(-?\d+\.\d+),\d+\.\d+-?\d*;-?\d+\.\d+,(-?\d+\.\d+)\?/);
      resolve({
        ok: true,
        json: () => Promise.resolve({
          code: "Ok",
          routes: [{ distance: MOCK_DIST, duration: MOCK_DUR }]
        })
      });
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

  console.log("— exact OSRM route —");
  const r1 = await R.route(A.lat, A.lng, B.lat, B.lng);
  ok(r1.distanceM === MOCK_DIST, "exact road distance from OSRM");
  ok(r1.durationS === MOCK_DUR, "exact duration from OSRM");
  ok(r1.source === "osrm", "source labelled osrm");
  ok(hits === 1, "one network hit for new pair");

  console.log("— cache / dedupe —");
  const hitsBefore = hits;
  const r2 = await R.route(A.lat, A.lng, B.lat, B.lng);
  ok(r1 === r2 || (r2.distanceM === MOCK_DIST), "repeat resolves from cache");
  ok(hits === hitsBefore, "no extra fetch on cached pair");
  const p = R.peek(B.lat, B.lng, { lat: A.lat, lng: A.lng });
  ok(p && p.source === "osrm", "peek() returns cached route");

  console.log("— honest fallback on failure —");
  failNext = true;
  const C = { lat: 12.9719, lng: 77.6412 };   // Indiranagar
  const r3 = await R.route(C.lat, C.lng, B.lat, B.lng);
  ok(r3.source === "estimate", "estimated source when OSRM fails");
  ok(r3.distanceM > 0 && r3.durationS > 0, "estimate has sane numbers");
  ok(hits >= 2, "failed attempt counted");

  console.log("— formatting (ride-app style) —");
  ok(R.fmtDistance(2447) === "2.4 km", "km rounded to 1 decimal");
  ok(R.fmtDistance(850) === "850 m", "sub-km shown in metres");
  ok(R.fmtEta(175.8) === "~3 min", "ETA ceil to minutes");
  ok(R.fmtEta(61) === "~2 min", "1m01s → ~2 min (ceiling)");

  console.log("— persistence to localStorage —");
  const persisted = Object.keys(JSON.parse(mem["fah.route.v1"] || "{}")).length;
  ok(persisted > 0, "route cache persisted (" + persisted + " routes)");
  ok(R.status().cached >= 2, "status reports cached count");

  console.log("\n%d passed, %d failed", pass, fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });