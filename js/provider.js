// FabricAtHome — provider: storage abstraction + auth/session layer.
// Contract mirrors the future Supabase backend so the app can go live
// by swapping the adapter, not rewriting views.

(function () {
  "use strict";

  // --- Storage adapter ------------------------------------------------------
  // localAdapter: full CRUD over localStorage (V1 seed + demo).
  // supabaseAdapter: stub with the same surface; wired by backend/README.

  const LS_KEY = "fah.state.v2";

  function loadLS() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveLS(state) {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }

  const localAdapter = {
    load: loadLS,
    save: saveLS,
    kind: "local"
  };

  const supabaseAdapter = {
    load: () => null,
    save: () => {},
    kind: "supabase"
  };

  function activeAdapter() {
    // If backend/ keys are configured, use supabase; else local.
    return (typeof FH_BACKEND !== "undefined" && FH_BACKEND.enabled)
      ? supabaseAdapter
      : localAdapter;
  }

  // --- Session/auth ---------------------------------------------------------
  const SESSION_KEY = "fah.session.v2";

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
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
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

  window.FAHProvider = {
    adapter: activeAdapter,
    localAdapter,
    supabaseAdapter,
    // session
    login,
    logout,
    currentUser,
    isRole,
    // state pass-through (views use this; logic in store)
    readState() { return activeAdapter().load(); },
    writeState(s) { activeAdapter().save(s); }
  };
})();