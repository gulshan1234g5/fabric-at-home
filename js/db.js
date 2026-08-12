// FabricAtHome — db: IndexedDB local-first data layer (2026 research-aligned).
//
// The device holds the PRIMARY copy of app data (local-first, not just
// offline-first). The service worker caches the shell; this module is where
// *data* lives. localStorage is the fallback floor for environments without
// IndexedDB (file://, headless tests, very old WebViews).
//
// Design:
//   - kv store: single "state" record (+ a small meta KEY) — a blob mirror of
//     the provider's working copy, so the app can rehydrate an unloaded page.
//   - queue store: pending offline mutations. With a real Supabase backend
//     these replay on `online` (last-write-wins, field-level semantics). In the
//     local-first build writes land in IDB instantly; the queue is kept to
//     keep the contract backend-ready (see backend/README.md).
//   - BroadcastChannel: same-device multi-tab sync — the local-first "server
//     is a sync peer" idea applied to tab replicas, so a change in one tab
//     rehydrates the others without network.
//
// All APIs return Promises; the module fails closed (rejects) if IDB is
// unavailable so callers can fall back to the in-memory/localStorage adapter.

(function () {
  "use strict";

  const DB_NAME = "fah-local-v1";      // bump on schema change
  const DB_VERSION = 1;
  const KV_STORE = "kv";
  const QUEUE_STORE = "queue";

  let dbPromise = null;

  function isSupported() {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  }

  function open() {
    if (dbPromise) return dbPromise;
    if (!isSupported()) {
      dbPromise = Promise.reject(new Error("idb-unavailable"));
      return dbPromise;
    }
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(KV_STORE)) {
          db.createObjectStore(KV_STORE); // keyPath-less key/value
        }
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const q = db.createObjectStore(QUEUE_STORE, { keyPath: "ts" });
          q.createIndex("kind", "kind", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("idb-open"));
    });
    return dbPromise;
  }

  function close() {
    if (!dbPromise) return;
    dbPromise.then((db) => {
      try { db.close(); } catch (e) {}
    }).catch(() => {});
    dbPromise = null;
  }

  function reqToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("idb-request"));
    });
  }

  function get(key) {
    return open()
      .then((db) => reqToPromise(db.transaction(KV_STORE).objectStore(KV_STORE).get(key)));
  }
  function put(key, value) {
    return open()
      .then((db) => reqToPromise(db.transaction(KV_STORE, "readwrite").objectStore(KV_STORE).put(value, key)));
  }
  function del(key) {
    return open()
      .then((db) => reqToPromise(db.transaction(KV_STORE, "readwrite").objectStore(KV_STORE).delete(key)));
  }

  // ---- offline mutation queue (backend-ready contract) ---------------------

  function enqueue(mutation) {
    const m = Object.assign({}, mutation, { ts: Date.now(), queued: true });
    if (!m.kind) m.kind = "unknown";
    return open().then((db) => {
      const store = db.transaction(QUEUE_STORE, "readwrite").objectStore(QUEUE_STORE);
      return reqToPromise(store.put(m));
    });
  }
  function allQueue() {
    return open().then((db) =>
      reqToPromise(db.transaction(QUEUE_STORE).objectStore(QUEUE_STORE).getAll()));
  }
  function removeQueue(ts) {
    return open().then((db) => {
      const store = db.transaction(QUEUE_STORE, "readwrite").objectStore(QUEUE_STORE);
      return reqToPromise(store.delete(ts));
    });
  }
  function drainQueue(handler) {
    return allQueue().then((items) => {
      if (!items.length) return { drained: 0 };
      let done = 0;
      const run = () => {
        const item = items[done];
        if (!item) return Promise.resolve();
        const handle = handler ? handler(item) : Promise.resolve();
        return Promise.resolve(handle).then(() => removeQueue(item.ts)).then(() => {
          done++;
          return run();
        });
      };
      return run().then(() => ({ drained: done }));
    });
  }

  window.FAHDB = {
    isSupported,
    open,
    close,
    get,
    put,
    del,
    enqueue,
    allQueue,
    removeQueue,
    drainQueue,
    KV_STORE,
    QUEUE_STORE
  };
})();