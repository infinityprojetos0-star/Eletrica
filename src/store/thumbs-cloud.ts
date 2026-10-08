/**
 * Galeria Thumb só no Realtime Database (Spark · sem Storage).
 * Path isolado: thumbGallery (fora de voltes, o Store do app não mexe).
 */
// @ts-nocheck
import { FirebaseApp, getDb, init as initFirebase } from "./firebase";

/** Fora de /voltes — evita conflito com o sync do app */
export const THUMBS_ROOT = "thumbGallery";

const MAX_EDGE = 900;
const JPEG_QUALITY = 0.65;
const MAX_BLOB = 100 * 1024;

function thumbsRef() {
  initFirebase({ skipVisibility: true });
  const db = getDb();
  if (!db) return null;
  return db.ref(THUMBS_ROOT);
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

export function compressImage(file, quality = JPEG_QUALITY, maxEdge = MAX_EDGE) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type?.startsWith("image/")) {
      reject(new Error("Arquivo não é imagem"));
      return;
    }

    if (file.type === "image/svg+xml" || file.type === "image/gif") {
      if (file.size > MAX_BLOB) {
        reject(new Error("Arquivo grande demais para a RTDB (máx. ~100 KB)"));
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
          if (blob.size > MAX_BLOB && (quality > 0.4 || maxEdge > 600)) {
            try {
              resolve(
                await compressImage(
                  file,
                  Math.max(0.4, quality - 0.12),
                  Math.max(600, maxEdge - 200)
                )
              );
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

function parseSnap(snap) {
  const val = snap.val() || {};
  return Object.keys(val)
    .map((k) => ({ ...val[k], id: val[k]?.id || k }))
    .filter((x) => x.url && String(x.url).startsWith("data:"))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function uploadThumb(file) {
  const listRef = thumbsRef();
  if (!listRef) throw new Error("Firebase RTDB indisponível");

  const { dataUrl, contentType, name, size } = await compressImage(file);
  if (!dataUrl || dataUrl.length > 220000) {
    throw new Error("Imagem excede o limite da RTDB — use arquivo menor");
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

export function subscribeThumbs(onChange, onError) {
  const listRef = thumbsRef();
  if (!listRef) {
    onError?.(new Error("Firebase RTDB indisponível"));
    onChange?.([]);
    return () => {};
  }

  let lastNonEmpty = [];
  let emptyTimer = null;

  const emit = (list) => {
    onChange?.(list);
  };

  const handler = (snap) => {
    const list = parseSnap(snap);
    if (list.length) {
      lastNonEmpty = list;
      if (emptyTimer) {
        clearTimeout(emptyTimer);
        emptyTimer = null;
      }
      emit(list);
      return;
    }
    // Flash vazio (reconnect) — confirma antes de limpar a UI
    if (lastNonEmpty.length) {
      if (emptyTimer) clearTimeout(emptyTimer);
      emptyTimer = setTimeout(() => {
        listRef.once("value").then(
          (snap2) => {
            const list2 = parseSnap(snap2);
            if (list2.length) lastNonEmpty = list2;
            else lastNonEmpty = [];
            emit(list2);
          },
          () => emit(lastNonEmpty)
        );
      }, 450);
      return;
    }
    emit([]);
  };

  const errHandler = (err) => {
    console.error("thumbs subscribe:", err);
    onError?.(err);
  };

  listRef.on("value", handler, errHandler);
  return () => {
    if (emptyTimer) clearTimeout(emptyTimer);
    listRef.off("value", handler);
  };
}

export function firebaseReady() {
  try {
    initFirebase({ skipVisibility: true });
    return !!FirebaseApp.getDb();
  } catch {
    return false;
  }
}
