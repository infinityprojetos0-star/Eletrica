/**
 * Galeria Thumb só no Realtime Database (Spark gratuito — sem Storage).
 * Imagens entram como data URL JPEG comprimido (economia de quota).
 */
// @ts-nocheck
import { FirebaseApp, ROOT, getDb, init as initFirebase } from "./firebase";

const MAX_EDGE = 1000;
const JPEG_QUALITY = 0.7;
/** Limite do blob antes do base64 (~240 KB na RTDB). */
const MAX_BLOB = 180 * 1024;

function thumbsRef() {
  initFirebase();
  const db = getDb();
  if (!db) return null;
  return db.ref(`${ROOT}/thumbs`);
}

function uid() {
  return `th-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler imagem"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Reduz bem a imagem (só RTDB — sem Storage).
 * SVG pequeno pode ir como data URL; GIF grande é rejeitado.
 */
export function compressImage(file, quality = JPEG_QUALITY, maxEdge = MAX_EDGE) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith("image/")) {
      reject(new Error("Arquivo não é imagem"));
      return;
    }

    if (file.type === "image/svg+xml") {
      if (file.size > 80 * 1024) {
        reject(new Error("SVG grande demais para a RTDB (máx. ~80 KB)"));
        return;
      }
      blobToDataUrl(file).then((dataUrl) =>
        resolve({ dataUrl, contentType: file.type, name: file.name, size: file.size })
      );
      return;
    }

    if (file.type === "image/gif") {
      if (file.size > MAX_BLOB) {
        reject(new Error("GIF grande demais — use JPG/PNG (máx. ~180 KB)"));
        return;
      }
      blobToDataUrl(file).then((dataUrl) =>
        resolve({ dataUrl, contentType: file.type, name: file.name, size: file.size })
      );
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, maxEdge / Math.max(width, height || 1));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
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
        async (blob) => {
          if (!blob) {
            reject(new Error("Falha ao comprimir"));
            return;
          }
          if (blob.size > MAX_BLOB && quality > 0.4) {
            try {
              const again = await compressImage(file, Math.max(0.4, quality - 0.15), Math.min(maxEdge, 800));
              resolve(again);
              return;
            } catch (e) {
              reject(e);
              return;
            }
          }
          if (blob.size > MAX_BLOB) {
            reject(new Error("Imagem ainda grande para a RTDB — escolha outra menor"));
            return;
          }
          const dataUrl = await blobToDataUrl(blob);
          const base = String(file.name || "imagem").replace(/\.[^.]+$/, "");
          resolve({
            dataUrl,
            contentType: "image/jpeg",
            name: `${base}.jpg`,
            size: blob.size
          });
        },
        "image/jpeg",
        quality
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
  const listRef = thumbsRef();
  if (!listRef) throw new Error("Firebase RTDB indisponível");

  const { dataUrl, contentType, name, size } = await compressImage(file);
  if (!dataUrl || dataUrl.length > 350000) {
    throw new Error("Imagem excede o limite da RTDB gratuita — use arquivo menor");
  }

  const id = uid();
  const meta = {
    id,
    name: name || file.name || id,
    url: dataUrl,
    size: size || dataUrl.length,
    contentType,
    createdAt: Date.now(),
    via: "rtdb"
  };
  await listRef.child(id).set(meta);
  return meta;
}

export async function deleteThumb(item) {
  if (!item?.id) return;
  const listRef = thumbsRef();
  if (listRef) await listRef.child(item.id).remove();
}

/** Escuta a lista remota. Retorna unsubscribe. */
export function subscribeThumbs(onChange, onError) {
  const listRef = thumbsRef();
  if (!listRef) {
    onError?.(new Error("Firebase RTDB indisponível"));
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
