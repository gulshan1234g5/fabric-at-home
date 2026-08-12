// FabricAtHome service worker — v8 (research-aligned: stale-while-revalidate).
//
// NOTES ON DEPLOY-MENTALITY:
//   * Every release MUST bump these version constants — otherwise returning
//     clients (phones) keep serving the OLD shell from the same cache name and
//     "my changes didn't apply". Cache-first + version bump = deterministic.
//   * On activate, any cache outside `keep` is purged, so a bumped release
//     self-cleans old versions on the device.
//
// Split caches:
//   fah-shell-N   — the app shell (static assets). Cache-first, versioned.
//   fah-runtime-N — same-origin runtime fetches (SEO/data JSON later).
//   fah-pages-N   — navigations. Network-first, falls back to shell (offline).
//
// Caching rules (2026 best practice):
//   * Navigation -> network-first; if the network dies, serve cached ./index.html.
//   * Static shell -> cache-first (never refetch; version bump invalidates).
//   * Same-origin GET JSON/API -> stale-while-revalidate.
//   * Everything else (external OSRM/reverse-geocode) -> never cached (privacy).
//   * Skip-waiting on a SKIP_WAITING message so an update applies cleanly.

const SHELL = "fah-shell-v9";
const RUNTIME = "fah-runtime-v9";
const PAGES = "fah-pages-v9";
const PAGES_COOKIE = "fah-v9";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/data.js",
  "./js/search.js",
  "./js/db.js",
  "./js/provider.js",
  "./js/store.js",
  "./js/geo.js",
  "./js/route.js",
  "./js/app.js",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  const keep = [SHELL, RUNTIME, PAGES];
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isNavigation(req) {
  return req.mode === "navigate";
}
function isStaticAsset(req) {
  return ASSETS.some((a) => {
    const url = new URL(req.url);
    const clean = url.pathname.split("/").pop() || "./";
    return ("./" + clean) === a || clean === a.replace(/^\.\//, "");
  });
}
function isApi(req) {
  const url = new URL(req.url);
  return url.origin === self.location.origin &&
    (url.pathname.includes("/data/") || req.url.includes(".json") || req.url.includes("/api"));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cache third-party

  // 1) Navigations: network-first with offline fallback to app shell.
  if (isNavigation(req)) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(PAGES).then((c) => c.put(PAGES_COOKIE, copy));
        return res;
      }).catch(() =>
        caches.match(PAGES_COOKIE).then((hit) => hit || caches.match("./index.html"))
      )
    );
    return;
  }

  // 2) App shell static assets: cache-first.
  if (isStaticAsset(req)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        if (res.ok) caches.open(SHELL).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // 3) Same-origin data/API: stale-while-revalidate.
  if (isApi(req)) {
    e.respondWith(
      caches.open(RUNTIME).then((cache) =>
        cache.match(req).then((hit) => {
          const network = fetch(req).then((res) => {
            const copy = res.clone();
            if (res.ok) cache.put(req, copy);
            return res;
          }).catch(() => hit);
          return hit || network;
        })
      )
    );
    return;
  }

  // 4) Everything else same-origin: network with cache fallback (shell offline).
  e.respondWith(
    fetch(req).catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});

// Apply updates immediately when the page asks us to.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});