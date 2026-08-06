/** Firebase Realtime Database (compat API — mesma superfície do app legado). */
import firebase from "firebase/compat/app";
import "firebase/compat/database";

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDzi2PKBnGiiHmoL32_lw8HCgS5WcUc5GI",
  authDomain: "eletrica-86ed1.firebaseapp.com",
  databaseURL: "https://eletrica-86ed1-default-rtdb.firebaseio.com",
  projectId: "eletrica-86ed1",
  storageBucket: "eletrica-86ed1.firebasestorage.app",
  messagingSenderId: "619376902152",
  appId: "1:619376902152:web:37ab1ef9a53e0d6d8511bd",
  measurementId: "G-WG09GHN1JP"
};

let db: firebase.database.Database | null = null;
let ready = false;
let error: string | null = null;
let visibilityBound = false;

export function init() {
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    db = firebase.database();
    ready = true;
    bindVisibility();
    return db;
  } catch (err: any) {
    error = err?.message || String(err);
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

export function getDb() {
  return db || init();
}

export function isReady() {
  return ready && !!getDb();
}

export function getError() {
  return error;
}

export const ROOT = "voltes";

export function ref(path: string) {
  const database = getDb();
  if (!database) return null;
  return database.ref(path);
}

export const FirebaseApp = { init, getDb, isReady, getError, ref, ROOT };
