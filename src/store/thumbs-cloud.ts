/**
 * Galeria Thumb na nuvem (Firebase Storage + RTDB).
 * Plano Spark (gratuito): Storage 5 GB · download 1 GB/dia.
 * Imagens são redimensionadas no cliente antes do upload.
 */
// @ts-nocheck
import firebase from "firebase/compat/app";
import "firebase/compat/storage";
import { FirebaseApp, ROOT, getDb, init as initFirebase } from "./firebase";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;
const MAX_BYTES = 2.5 * 1024 * 1024;

function thumbsRef() {
  initFirebase();
  const db = getDb();
  if (!db) return null;
  return db.ref(`${ROOT}/thumbs`);
}

function storage() {
  initFirebase();
  if (!firebase.apps.length) return null;
  return firebase.storage();
}

function uid() {
  return `th-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Reduz resolução/tamanho p/ caber no Spark. GIF/SVG passam direto (com limite). */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith("image/")) {
      reject(new Error("Arquivo não é imagem"));
      return;
    }
    if (file.type === "image/gif" || file.type === "image/svg+xml") {
      if (file.size > MAX_BYTES) {
        reject(new Error("GIF/SVG acima de 2,5 MB — reduza o arquivo"));
        return;
      }
      resolve({ blob: file, contentType: file.type, name: file.name });
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas indisponível"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Falha ao comprimir"));
            return;
          }
          if (blob.size > MAX_BYTES) {
            reject(new Error("Imagem ainda grande demais após compressão"));
            return;
          }
          const base = String(file.name || "imagem").replace(/\.[^.]+$/, "");
          resolve({
            blob,
            contentType: "image/jpeg",
            name: `${base}.jpg`
          });
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler a imagem"));
    };
    img.src = url;
  });
}

export async function uploadThumb(file) {
  const st = storage();
  const listRef = thumbsRef();
  if (!st || !listRef) throw new Error("Firebase indisponível");

  const { blob, contentType, name } = await compressImage(file);
  const id = uid();
  const ext =
    contentType === "image/png"
      ? "png"
      : contentType === "image/webp"
        ? "webp"
        : contentType === "image/gif"
          ? "gif"
          : contentType === "image/svg+xml"
            ? "svg"
            : "jpg";
  const storagePath = `thumbs/${id}.${ext}`;
  const obj = st.ref(storagePath);
  await obj.put(blob, {
    contentType,
    cacheControl: "public,max-age=31536000"
  });
  const url = await obj.getDownloadURL();
  const meta = {
    id,
    name: name || file.name || id,
    url,
    storagePath,
    size: blob.size,
    contentType,
    createdAt: Date.now()
  };
  await listRef.child(id).set(meta);
  return meta;
}

export async function deleteThumb(item) {
  if (!item?.id) return;
  const st = storage();
  const listRef = thumbsRef();
  if (item.storagePath && st) {
    try {
      await st.ref(item.storagePath).delete();
    } catch (err) {
      // arquivo já sumiu — segue apagando o índice
      console.warn("Storage delete:", err);
    }
  }
  if (listRef) await listRef.child(item.id).remove();
}

/** Escuta a lista remota. Retorna unsubscribe. */
export function subscribeThumbs(onChange, onError) {
  const listRef = thumbsRef();
  if (!listRef) {
    onError?.(new Error("Firebase indisponível"));
    onChange?.([]);
    return () => {};
  }
  const handler = (snap) => {
    const val = snap.val() || {};
    const list = Object.keys(val)
      .map((k) => ({ ...val[k], id: val[k]?.id || k }))
      .filter((x) => x.url)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    onChange?.(list);
  };
  const errHandler = (err) => {
    console.error("thumbs subscribe:", err);
    onError?.(err);
  };
  listRef.on("value", handler, errHandler);
  return () => listRef.off("value", handler);
}

export function firebaseReady() {
  try {
    return !!FirebaseApp.getDb();
  } catch {
    return false;
  }
}
