/**
 * Cache local VoltES — memória + localStorage (rápido) + IndexedDB (persistente/robusto)
 * Reduz leituras no Firebase e sobrevive a reload/offline.
 */
const DataCache = (() => {
  const LS_STATE = "voltes-data-v2";
  const LS_META = "voltes-cache-meta-v1";
  const LS_PENDING = "voltes-pending-v1";
  const LS_DEVICE = "voltes-device-id";
  const DB_NAME = "voltes-idb-v1";
  const DB_STORE = "kv";
  const IDB_STATE = "state";
  const IDB_PENDING = "pending";
  const IDB_META = "meta";

  let memoryState = null;
  let memoryPending = {};
  let memoryMeta = { savedAt: 0, rev: 0 };
  let dbPromise = null;
  let idbWriteTimer = null;

  function deviceId() {
    try {
      let id = localStorage.getItem(LS_DEVICE);
      if (!id) {
        id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem(LS_DEVICE, id);
      }
      return id;
    } catch {
      return `dev-temp-${Math.random().toString(36).slice(2, 9)}`;
    }
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    if (typeof indexedDB === "undefined") {
      dbPromise = Promise.resolve(null);
      return dbPromise;
    }
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return dbPromise;
  }

  function idbGet(key) {
    return openDb().then(
      (db) =>
        new Promise((resolve) => {
          if (!db) return resolve(undefined);
          try {
            const tx = db.transaction(DB_STORE, "readonly");
            const req = tx.objectStore(DB_STORE).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(undefined);
          } catch {
            resolve(undefined);
          }
        })
    );
  }

  function idbSet(key, value) {
    return openDb().then(
      (db) =>
        new Promise((resolve) => {
          if (!db) return resolve(false);
          try {
            const tx = db.transaction(DB_STORE, "readwrite");
            tx.objectStore(DB_STORE).put(value, key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
          } catch {
            resolve(false);
          }
        })
    );
  }

  function readLs(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeLs(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function scheduleIdbFlush() {
    if (idbWriteTimer) clearTimeout(idbWriteTimer);
    idbWriteTimer = setTimeout(() => {
      idbSet(IDB_STATE, memoryState);
      idbSet(IDB_PENDING, memoryPending);
      idbSet(IDB_META, memoryMeta);
    }, 400);
  }

  function getState() {
    return memoryState;
  }

  function setState(state, { persist = true } = {}) {
    memoryState = state;
    memoryMeta = { ...memoryMeta, savedAt: Date.now() };
    if (!persist) return;
    writeLs(LS_STATE, state);
    writeLs(LS_META, memoryMeta);
    scheduleIdbFlush();
  }

  function getPending() {
    return { ...memoryPending };
  }

  function setPending(pending, { persist = true } = {}) {
    memoryPending = { ...(pending || {}) };
    if (!persist) return;
    writeLs(LS_PENDING, memoryPending);
    scheduleIdbFlush();
  }

  /** Firebase rejeita undefined — limpa recursivamente (null = delete ok) */
  function sanitizeFirebase(value) {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) {
      return value
        .map(sanitizeFirebase)
        .filter((v) => v !== undefined);
    }
    const out = {};
    Object.keys(value).forEach((k) => {
      const v = sanitizeFirebase(value[k]);
      if (v !== undefined) out[k] = v;
    });
    return out;
  }

  function queuePatch(path, value) {
    if (!path) return;
    // undefined no valor = inválido (use null para apagar no RTDB)
    if (value === undefined) {
      delete memoryPending[path];
      writeLs(LS_PENDING, memoryPending);
      scheduleIdbFlush();
      return;
    }
    const clean = value === null ? null : sanitizeFirebase(value);
    if (clean === undefined) {
      delete memoryPending[path];
      writeLs(LS_PENDING, memoryPending);
      scheduleIdbFlush();
      return;
    }
    memoryPending[path] = {
      value: clean,
      ts: Date.now(),
      deviceId: deviceId()
    };
    writeLs(LS_PENDING, memoryPending);
    scheduleIdbFlush();
  }

  function scrubPending() {
    const next = {};
    Object.entries(memoryPending || {}).forEach(([path, op]) => {
      if (!op || op.value === undefined) return;
      if (op.value === null) {
        next[path] = op;
        return;
      }
      const clean = sanitizeFirebase(op.value);
      if (clean === undefined) return;
      next[path] = { ...op, value: clean };
    });
    memoryPending = next;
    writeLs(LS_PENDING, memoryPending);
    scheduleIdbFlush();
    return memoryPending;
  }

  function clearPatches(paths) {
    paths.forEach((p) => {
      delete memoryPending[p];
    });
    writeLs(LS_PENDING, memoryPending);
    scheduleIdbFlush();
  }

  function getMeta() {
    return { ...memoryMeta };
  }

  function setMeta(partial) {
    memoryMeta = { ...memoryMeta, ...partial };
    writeLs(LS_META, memoryMeta);
    scheduleIdbFlush();
  }

  /** Boot síncrono (LS) + upgrade assíncrono (IDB se mais novo) */
  async function hydrate(fallbackState) {
    const lsState = readLs(LS_STATE, null);
    const lsMeta = readLs(LS_META, { savedAt: 0 });
    const lsPending = readLs(LS_PENDING, {});

    memoryState = lsState || fallbackState;
    memoryMeta = lsMeta || { savedAt: 0 };
    memoryPending = lsPending || {};

    const [idbState, idbPending, idbMeta] = await Promise.all([
      idbGet(IDB_STATE),
      idbGet(IDB_PENDING),
      idbGet(IDB_META)
    ]);

    const idbSaved = idbMeta?.savedAt || 0;
    const lsSaved = memoryMeta.savedAt || 0;

    if (idbState && idbSaved > lsSaved) {
      memoryState = idbState;
      memoryMeta = idbMeta || memoryMeta;
      writeLs(LS_STATE, memoryState);
      writeLs(LS_META, memoryMeta);
    }

    if (idbPending && typeof idbPending === "object") {
      // Mescla pendências (IDB + LS) — não perde fila de sync
      memoryPending = { ...idbPending, ...memoryPending };
      writeLs(LS_PENDING, memoryPending);
    }

    scrubPending();

    if (!lsState && memoryState) writeLs(LS_STATE, memoryState);

    return {
      state: memoryState,
      pending: memoryPending,
      meta: memoryMeta,
      deviceId: deviceId()
    };
  }

  return {
    deviceId,
    hydrate,
    getState,
    setState,
    getPending,
    setPending,
    queuePatch,
    clearPatches,
    scrubPending,
    sanitizeFirebase,
    getMeta,
    setMeta
  };
})();
