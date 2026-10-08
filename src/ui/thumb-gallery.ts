/** Galeria Thumb — local + nuvem Firebase (Storage/RTDB, Spark gratuito). */
// @ts-nocheck
import {
  subscribeThumbs,
  uploadThumb,
  deleteThumb,
  firebaseReady
} from "../store/thumbs-cloud";

function loadBundledThumbs() {
  try {
    const modules = import.meta.glob("../thumbs/*.{png,jpg,jpeg,webp,gif,svg,PNG,JPG,JPEG,WEBP,GIF,SVG}", {
      eager: true,
      query: "?url",
      import: "default"
    });
    return Object.entries(modules).map(([path, url]) => ({
      id: `bundled-${path}`,
      name: path.split("/").pop() || path,
      src: url,
      bundled: true
    }));
  } catch {
    return [];
  }
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * Monta a galeria Thumb em `root`.
 * Imagens enviadas vão para o Firebase e aparecem em qualquer dispositivo.
 */
export function mountThumbGallery(root, opts = {}) {
  let remote = [];
  let uploading = false;
  let cloudError = null;
  let cloudOk = false;
  const toast = typeof opts.toast === "function" ? opts.toast : () => {};
  const standalone = !!opts.standalone;
  let unsub = null;

  const paint = () => {
    const bundled = loadBundledThumbs();
    const all = [
      ...bundled,
      ...remote.map((r) => ({
        id: r.id,
        name: r.name,
        src: r.url,
        remote: true,
        size: r.size,
        createdAt: r.createdAt
      }))
    ];

    root.innerHTML = `
      <div class="view-enter thumb-page">
        <div class="hero-note">
          <div>
            <h3>Thumb ${standalone ? "" : `<span class="badge badge-pendente">temporária</span>`}</h3>
            <p>Imagens na <strong>Realtime Database</strong> (plano gratuito · sem Storage). Qualquer pessoa com o link vê a mesma galeria.</p>
          </div>
        </div>
        <div class="thumb-status ${cloudError ? "err" : cloudOk ? "ok" : ""}">
          ${
            cloudError
              ? `<span>⚠ RTDB: ${esc(cloudError)} — libere leitura/escrita em <code>voltes/thumbs</code>.</span>`
              : cloudOk
                ? `<span>✓ RTDB conectada · ${remote.length} na galeria compartilhada</span>`
                : `<span>Conectando à Realtime Database…</span>`
          }
        </div>
        <div class="card thumb-drop ${uploading ? "busy" : ""}" id="thumbDrop">
          <input type="file" id="thumbFiles" accept="image/*" multiple hidden ${uploading ? "disabled" : ""} />
          <p><strong>${uploading ? "Enviando…" : "Arraste imagens aqui"}</strong>${
            uploading
              ? ""
              : ` ou <button type="button" class="btn btn-secondary btn-sm" id="thumbPick">Selecionar arquivos</button>`
          }</p>
          <p class="hint">JPG/PNG/WEBP · comprimidas no aparelho (~180 KB) · só Realtime Database</p>
        </div>
        <div class="thumb-toolbar">
          <span class="hint">${all.length} imagem(ns)${uploading ? " · enviando…" : ""}</span>
        </div>
        ${
          all.length
            ? `<div class="thumb-grid" id="thumbGrid">
                ${all
                  .map(
                    (img) => `
                  <figure class="thumb-card">
                    <button type="button" class="thumb-open" data-src="${esc(img.src)}" title="Ampliar">
                      <img src="${esc(img.src)}" alt="${esc(img.name || "imagem")}" loading="lazy" />
                    </button>
                    <figcaption>
                      <span class="thumb-name" title="${esc(img.name || "")}">${esc(img.name || "imagem")}</span>
                      ${
                        img.bundled
                          ? `<span class="hint">pasta</span>`
                          : img.remote
                            ? `<button type="button" class="btn btn-ghost btn-sm" data-thumb-rm="${esc(img.id)}">Apagar</button>`
                            : ""
                      }
                    </figcaption>
                  </figure>`
                  )
                  .join("")}
              </div>`
            : `<div class="empty"><strong>Nenhuma imagem na nuvem</strong>Envie arquivos acima — outros dispositivos verão em <code>/thumb/</code>.</div>`
        }
        <div class="thumb-lightbox" id="thumbLightbox" hidden>
          <button type="button" class="thumb-lightbox-close" id="thumbLbClose" aria-label="Fechar">×</button>
          <img id="thumbLbImg" alt="" />
        </div>
      </div>
    `;

    bindUi();
  };

  const addFiles = async (fileList) => {
    const files = [...(fileList || [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) {
      toast("Selecione arquivos de imagem");
      return;
    }
    if (!firebaseReady()) {
      toast("Firebase indisponível");
      return;
    }
    uploading = true;
    paint();
    let ok = 0;
    let fail = 0;
    for (const f of files) {
      try {
        await uploadThumb(f);
        ok += 1;
      } catch (err) {
        fail += 1;
        console.error(err);
        const msg = String(err?.code || err?.message || err);
        if (/permission|unauthorized/i.test(msg)) {
          cloudError = "sem permissão — regras RTDB em voltes/thumbs (.read/.write true)";
        }
        toast(msg.slice(0, 120));
      }
    }
    uploading = false;
    paint();
    if (ok) toast(`${ok} enviada(s) para a nuvem`);
    if (fail && !ok) toast("Falha no envio — veja o aviso da nuvem");
  };

  function bindUi() {
    root.querySelector("#thumbPick")?.addEventListener("click", () =>
      root.querySelector("#thumbFiles")?.click()
    );
    root.querySelector("#thumbFiles")?.addEventListener("change", (e) => {
      addFiles(e.target.files);
      e.target.value = "";
    });

    const drop = root.querySelector("#thumbDrop");
    if (drop) {
      drop.addEventListener("dragover", (e) => {
        e.preventDefault();
        drop.classList.add("dragover");
      });
      drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
      drop.addEventListener("drop", (e) => {
        e.preventDefault();
        drop.classList.remove("dragover");
        addFiles(e.dataTransfer?.files);
      });
    }

    root.querySelectorAll("[data-thumb-rm]").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.thumbRm;
        const item = remote.find((t) => t.id === id);
        if (!item) return;
        if (!confirm("Apagar esta imagem da nuvem (todos os dispositivos)?")) return;
        try {
          await deleteThumb(item);
          toast("Imagem apagada");
        } catch (err) {
          toast(String(err?.message || err));
        }
      };
    });

    const lb = root.querySelector("#thumbLightbox");
    const lbImg = root.querySelector("#thumbLbImg");
    const closeLb = () => {
      if (!lb || !lbImg) return;
      lb.hidden = true;
      lbImg.src = "";
    };
    root.querySelector("#thumbLbClose")?.addEventListener("click", closeLb);
    lb?.addEventListener("click", (e) => {
      if (e.target === lb) closeLb();
    });
    root.querySelectorAll(".thumb-open").forEach((btn) => {
      btn.onclick = () => {
        if (!lb || !lbImg) return;
        lbImg.src = btn.dataset.src;
        lb.hidden = false;
      };
    });
  }

  paint();

  unsub = subscribeThumbs(
    (list) => {
      remote = list;
      cloudOk = true;
      cloudError = null;
      if (!uploading) paint();
    },
    (err) => {
      cloudOk = false;
      const msg = String(err?.message || err || "erro");
      cloudError = /permission/i.test(msg)
        ? "leitura bloqueada — regras RTDB em voltes/thumbs"
        : msg.slice(0, 140);
      paint();
    }
  );

  return {
    getSession: () => remote,
    destroy: () => {
      unsub?.();
      unsub = null;
      root.innerHTML = "";
    }
  };
}
