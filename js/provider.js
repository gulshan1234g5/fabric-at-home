// FabricAtHome — provider: storage abstraction + auth/session layer.
// Contract mirrors the future Supabase backend so the app can go live
// by swapping the adapter, not rewriting views.
//
// Adapters (priority):
//   1. supabase  — real backend (stub; wired by backend/README).
//   2. idb       — IndexedDB local-first (device holds the primary copy).
//   3. local     — localStorage floor (tests, file://, old WebViews).
//
// The idb adapter keeps an in-memory mirror so the synchronous store surface
// (`readState`/`writeState`) stays intact while durable persistence is async
// and offline-safe. `boot()` rehydrates from IDB on load; cross-tab changes
// propagate via BroadcastChannel (the local-first "server is a sync peer"
// pattern applied to tab replicas).

(function () {
  "use strict";

  const LS_KEY = "fah.state.v2";
  const SESSION_KEY = "fah.session.v2";
  const STATE_ROW = "state.v2";        // key inside IDB kv store

  // ---- in-memory mirror (the working copy all views read) -----------------

  let mirror = null;                    // parsed state or null
  const bootCbs = [];
  let booting = true;
  let persistTimer = null;

  // ---- localStorage adapter (floor) ---------------------------------------

  function loadLS() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveLS(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }

  const localAdapter = { load: loadLS, save: saveLS, kind: "local" };

  // ---- IndexedDB adapter (local-first) ------------------------------------

  const idbAdapter = {
    kind: "idb",
    load() { return mirror; },
    save(state) {
      mirror = state;
      debouncedPersist();
    },
    boot() {
      return FAHDB.get(STATE_ROW).then((s) => {
        if (s && s.meta) { mirror = s; return s; }
        return null;
      });
    },
    persist() {
      if (!mirror) return Promise.resolve();
      return FAHDB.put(STATE_ROW, mirror).catch(() => {});
    },
    refresh() {
      return FAHDB.get(STATE_ROW).then((s) => {
        if (s && s.meta) mirror = s;
        return mirror;
      });
    }
  };

  // Debounced durable write (local-first: in-memory is instant, disk follows).
  function debouncedPersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      const ad = activeAdapter();
      if (ad && typeof ad.persist === "function") ad.persist();
    }, 250);
  }

  // ---- which adapter is active ---------------------------------------------

  function activeAdapter() {
    if (typeof FH_BACKEND !== "undefined" && FH_BACKEND.enabled) return supabaseAdapter;
    if (typeof FAHDB !== "undefined" && FAHDB.isSupported()) return idbAdapter;
    return localAdapter;
  }

  const supabaseAdapter = { load: () => null, save: () => {}, kind: "supabase" };

  // ---- boot / rehydrate ----------------------------------------------------

  function boot() {
    return new Promise((resolve) => {
      booting = true;
      const ad = activeAdapter();
      if (ad !== idbAdapter) {
        // sync floor: settle immediately with localStorage (or seed default)
        mirror = ad.load() || null;
        booting = false;
        bootCbs.forEach((cb) => { try { cb(mirror); } catch (e) {} });
        bootCbs.length = 0;
        return resolve(mirror);
      }
      ad.boot()
        .then((s) => { mirror = s; })
        .catch(() => { mirror = null; })
        .then(() => {
          booting = false;
          bootCbs.forEach((cb) => { try { cb(mirror); } catch (e) {} });
          bootCbs.length = 0;
          resolve(mirror);
        });
    });
  }
  function onBooted(cb) {
    if (!booting) { try { cb(mirror); } catch (e) {} return; }
    bootCbs.push(cb);
  }
  function isBooting() { return booting; }
  function bootedKind() { return activeAdapter().kind; }

  // Re-read the durable copy (pull-to-refresh). In local-first this is the same
  // device; with a backend it would be the network.
  function refresh() {
    const ad = activeAdapter();
    const p = typeof ad.refresh === "function"
      ? ad.refresh()
      : Promise.resolve(ad.load() || null);
    return p.then((s) => {
      if (s && s.meta) mirror = s;
      return mirror;
    });
  }

  // ---- network status --------------------------------------------------------

  function isOffline() {
    return typeof navigator !== "undefined" &&
      typeof navigator.onLine === "boolean" ? !navigator.onLine : false;
  }
  function onNetwork(cb) {
    if (typeof navigator === "undefined" ||
        typeof navigator.addEventListener !== "function") return () => {};
    const on = () => { try { cb(isOffline()); } catch (e) {} };
    navigator.addEventListener("online", on);
    navigator.addEventListener("offline", on);
    return () => {
      try {
        navigator.removeEventListener("online", on);
        navigator.removeEventListener("offline", on);
      } catch (e) {}
    };
  }

  // ---- same-device multi-tab sync (BroadcastChannel) -------------------------

  let bc = null;
  let bcCb = null;
  function onSync(cb) {
    bcCb = cb;
    if (typeof BroadcastChannel === "undefined") return;
    try {
      bc = bc || new BroadcastChannel("fah-sync");
      bc.onmessage = (ev) => {
        if (!ev.data || ev.data.type !== "state") return;
        // remote tab wrote; rehydrate our mirror from durable copy
        refresh().then((s) => { if (bcCb) bcCb(s); });
      };
    } catch (e) {}
  }
  function broadcastState() {
    if (typeof BroadcastChannel === "undefined") return;
    try { (bc || (bc = new BroadcastChannel("fah-sync"))).postMessage({ type: "state", at: Date.now() }); } catch (e) {}
  }

  // ---- session/auth ------------------------------------------------------------

  let session = null;
  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      session = raw ? JSON.parse(raw) : null;
    } catch (e) { session = null; }
    return session;
  }
  function persistSession(s) {
    session = s;
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function login(roleOrAccountId) {
    const accounts = (typeof FAH !== "undefined" ? FAH.accounts : null) || {};
    let acc =
      accounts[roleOrAccountId] ||
      Object.values(accounts).find((a) => a.id === roleOrAccountId);
    if (!acc) return null;
    persistSession({ accountId: acc.id, role: acc.role, at: Date.now() });
    return acc;
  }
  function logout() {
    persistSession(null);
    loadSession();
    return true;
  }
  function currentUser() {
    loadSession();
    if (!session || typeof FAH === "undefined") return null;
    return FAH.accounts[session.role] || null;
  }
  function isRole(role) {
    const u = currentUser();
    return !!(u && (u.role === role));
  }

  // ---- public surface -------------------------------------------------------

  window.FAHProvider = {
    adapter: activeAdapter,
    localAdapter,
    supabaseAdapter,
    idbAdapter,
    boot,
    onBooted,
    isBooting,
    bootedKind,
    refresh,
    isOffline,
    onNetwork,
    onSync,
    broadcastState,
    // session
    login,
    logout,
    currentUser,
    isRole,
    // state pass-through (views use this; logic in store)
    readState() {
      return activeAdapter().load();
    },
    writeState(s) {
      mirror = s;
      activeAdapter().save(s);
      broadcastState();
    }
  };
})();