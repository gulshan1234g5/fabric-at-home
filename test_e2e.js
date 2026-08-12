// FabricAtHome — E2E smoke suite (webapp-testing approach: recon → act → verify).
// Drives the LIVE deployed PWA in real headless Chromium with playwright-core.
// Covers: discovery load, search, EXACT road distance/ETA (OSRM), booking,
// live tracking, and console/page-error hygiene. Exits non-zero on any failure.
//
// Run:  node test_e2e.js
//       (uses /usr/bin/chromium-headless-shell; override CHROME_BIN if needed)

const { chromium } = require("/root/workspace/node_modules/playwright-core");

const BASE = "https://gulshan1234g5.github.io/fabric-at-home/";
const CHROME = process.env.CHROME_BIN || "/usr/bin/chromium-headless-shell";

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log("  PASS", label); }
  else { fail++; console.log("  FAIL", label); }
};

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-gpu"]
  });

  // GPS-granted context (real phone behavior) vs GPS-denied honesty check.
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 900 },
    geolocation: { latitude: 12.9352, longitude: 77.6245 },
    permissions: ["geolocation"]
  });
  const page = await ctx.newPage();

  const errors = [];
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE: " + m.text()); });
  page.on("requestfailed", (r) => {
    // OSRM host flakiness is expected + handled (rotation→estimate); not an app bug.
    if (/osrm\.org|openstreetmap\.de|bigdatacloud/.test(r.url())) return;
    errors.push("REQFAIL: " + r.url());
  });

  // --- Discovery load (recon after networkidle) -------------------------------
  console.log("— discovery —");
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 40000 });
  await page.waitForTimeout(1500);
  ok(await page.locator(".cat-card").count() === 4, "4 fabric categories render");
  ok(await page.locator(".showroom-card").count() === 4, "4 showroom cards render");
  ok(await page.locator("#fah-search").count() === 1, "search-first bar present");

  // --- EXACT road distance & ETA (OSRM table, single call) ---------------------
  console.log("— exact location (km / min) —");
  await page.waitForSelector('[id^="dist-m-"]:has-text("km")', { timeout: 15000 });
  const dists = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[id^="dist-m-"]')).map((e) => e.textContent));
  const etas = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[id^="dist-e-"]')).map((e) => e.textContent));
  const routeStatus = await page.evaluate(() =>
    window.FAHRoute ? window.FAHRoute.status() : null);
  ok(dists.length === 4, "all 4 cards show road distance");
  ok(dists.every((d) => /\d+\.\d km|\d+ m/.test(d)), "distances formatted (km or m): " + dists.join(", "));
  ok(etas.every((e) => e.includes("min away")), "ETAs in x min away: " + etas.join(", "));
  ok(routeStatus && routeStatus.osrm >= 4, "routes came from OSRM (exact): " + JSON.stringify(routeStatus));
  ok(!(await page.locator(".loc-note").count()), "no 'distances from default' note when GPS live");

  // --- Search (instant, grouped) -----------------------------------------------
  console.log("— search —");
  await page.locator("#fah-search").fill("velvet");
  await page.waitForTimeout(400);
  ok(await page.locator(".search-results .fabric-card").count() >= 1, "velvet → fabric results");
  ok(await page.locator(".search-results .empty").count() === 0, "no zero-state for a real hit");
  await page.locator("#fah-search").fill("");
  await page.waitForTimeout(400);
  ok(await page.locator(".showroom-card").count() === 4, "clear → discovery list restored");
  await page.locator("#fah-search").fill("zzz-not-found");
  await page.waitForTimeout(400);
  ok(await page.locator(".search-results .empty").count() === 1, "garbage → useful zero-state");

  // --- Booking journey ----------------------------------------------------------
  console.log("— book a visit —");
  await page.locator("#fah-search").fill("");
  await page.waitForTimeout(300);
  await page.locator(".showroom-card").first().click();
  await page.waitForSelector(".sh-hero", { timeout: 8000 });
  ok(await page.locator('[id^="sh-eta-"]:has-text("min")').count() === 1, "showroom hero shows ETA");
  await page.locator('[data-nav="book"]').first().click();
  await page.waitForSelector("#bk-submit", { timeout: 8000 });
  ok(await page.locator(".slot").count() === 6, "6 bookable 30-min slots");
  await page.locator("#bk-addr").fill("E2E Test, Main Road, Koramangala");
  await page.locator("#bk-pin").fill("560034");
  await page.locator(".slot").first().click();
  await page.locator("#bk-submit").click();
  await page.waitForSelector(".live-hero", { timeout: 8000 });
  ok((await page.locator(".live-hero h2").textContent()).includes("assigned"), "visit assigned → live tracking");

  // --- Local-first persistence (IndexedDB) -------------------------------------
  // Wait past the 250ms debounced durable write before reading IDB.
  await page.waitForTimeout(900);
  const idb = await page.evaluate(() => new Promise((res) => {
    const req = indexedDB.open("fah-local-v1");
    req.onsuccess = () => {
      try {
        const g = req.result.transaction("kv").objectStore("kv").get("state.v2");
        g.onsuccess = () => res(!!(g.result && g.result.meta));
        g.onerror = () => res(false);
      } catch (e) { res(false); }
    };
    req.onerror = () => res(false);
  }));
  ok(idb, "state persisted to IndexedDB (local-first)");

  // --- Hygiene -----------------------------------------------------------------
  console.log("— hygiene —");
  const realErrors = errors.filter((e) => !e.includes("favicon"));
  ok(realErrors.length === 0, "no console/page errors: " + (realErrors.slice(0, 3).join(" | ") || "clean"));

  // --- Honesty: no GPS permission → note explains fallback area -----------------
  console.log("— GPS-denied honesty —");
  const ctxDenied = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const pageDenied = await ctxDenied.newPage();
  await pageDenied.goto(BASE, { waitUntil: "networkidle", timeout: 40000 });
  await pageDenied.waitForTimeout(1200);
  const note = await pageDenied.locator(".loc-note").first().textContent().catch(() => "");
  ok(note.includes("Distances from"), "offers 'Distances from {area}' + Set location when GPS denied");
  await ctxDenied.close();

  await browser.close();
  console.log("\n%d passed, %d failed", pass, fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });