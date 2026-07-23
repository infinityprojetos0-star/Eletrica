/** Configuração Firebase — VoltES (Realtime Database, plano gratuito) */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDzi2PKBnGiiHmoL32_lw8HCgS5WcUc5GI",
  authDomain: "eletrica-86ed1.firebaseapp.com",
  databaseURL: "https://eletrica-86ed1-default-rtdb.firebaseio.com",
  projectId: "eletrica-86ed1",
  storageBucket: "eletrica-86ed1.firebasestorage.app",
  messagingSenderId: "619376902152",
  appId: "1:619376902152:web:37ab1ef9a53e0d6d8511bd",
  measurementId: "G-WG09GHN1JP"
};

const FirebaseApp = (() => {
  let db = null;
  let ready = false;
  let error = null;
  let visibilityBound = false;

  function init() {
    try {
      if (typeof firebase === "undefined") {
        error = "SDK Firebase não carregou";
        return null;
      }
      if (!firebase.apps.length) {
        firebase.initializeApp(FIREBASE_CONFIG);
      }
      db = firebase.database();
      ready = true;
      bindVisibility();
      return db;
    } catch (err) {
      error = err.message || String(err);
      console.error("Firebase init:", err);
      return null;
    }
  }

  function bindVisibility() {
    if (visibilityBound || typeof document === "undefined") return;
    visibilityBound = true;
    document.addEventListener("visibilitychange", () => {
      const database = getDb();
      if (!database) return;
      if (document.hidden) database.goOffline();
      else database.goOnline();
    });
  }

  function getDb() {
    return db || init();
  }

  function isReady() {
    return ready && !!getDb();
  }

  function getError() {
    return error;
  }

  function ref(path) {
    const database = getDb();
    if (!database) return null;
    return database.ref(path);
  }

  return { init, getDb, isReady, getError, ref, ROOT: "voltes" };
})();
