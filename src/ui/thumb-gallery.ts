/** Galeria Thumb — reutilizada no app e na URL /thumb/ */
// @ts-nocheck

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

function uid(prefix = "thumb") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Monta a galeria Thumb em `root`.
 * @returns {{ getSession: () => any[], destroy: () => void }}
 */
export function mountThumbGallery(root, opts = {}) {
  let session = Array.isArray(opts.session) ? [...opts.session] : [];
  const toast = typeof opts.toast === "function" ? opts.toast : () => {};
  const standalone = !!opts.standalone;
  const onSessionChange =
    typeof opts.onSessionChange === "function" ? opts.onSessionChange : null;

  const setSession = (next) => {
    session = next;
    onSessionChange?.(session);
  };

  const paint = () => {
    const bundled = loadBundledThumbs();
    const all = [...bundled, ...session];

    root.innerHTML = `
      <div class="view-enter thumb-page">
        <div class="hero-note">
          <div>
            <h3>Thumb ${standalone ? "" : `<span class="badge badge-pendente">temporária</span>`}</h3>
            <p>${
              standalone
                ? "Arraste ou selecione imagens para visualizar nesta página."
                : `Coloque arquivos em <code>src/thumbs/</code> (e rode o build) ou arraste / selecione imagens aqui.`
            }</p>
          </div>
        </div>
        <div class="card thumb-drop" id="thumbDrop">
          <input type="file" id="thumbFiles" accept="image/*" multiple hidden />
          <p><strong>Arraste imagens aqui</strong> ou <button type="button" class="btn btn-secondary btn-sm" id="thumbPick">Selecionar arquivos</button></p>
          <p class="hint">PNG, JPG, WEBP, GIF, SVG · ficam só nesta sessão do navegador</p>
        </div>
        <div class="thumb-toolbar">
          <span class="hint">${all.length} imagem(ns)</span>
          ${
            session.length
              ? `<button type="button" class="btn btn-ghost btn-sm" id="thumbClear">Limpar sessão</button>`
              : ""
          }
        </div>
        ${
          all.length
            ? `<div class="thumb-grid" id="thumbGrid">
                ${all
                  .map(
                    (img) => `
                  <figure class="thumb-card">
                    <button type="button" class="thumb-open" data-src="${String(img.src).replace(/"/g, "&quot;")}" title="Ampliar">
                      <img src="${img.src}" alt="${String(img.name || "imagem").replace(/"/g, "&quot;")}" loading="lazy" />
                    </button>
                    <figcaption>
                      <span class="thumb-name" title="${String(img.name || "").replace(/"/g, "&quot;")}">${img.name || "imagem"}</span>
                      ${
                        img.bundled
                          ? `<span class="hint">pasta</span>`
                          : `<button type="button" class="btn btn-ghost btn-sm" data-thumb-rm="${img.id}">Remover</button>`
                      }
                    </figcaption>
                  </figure>`
                  )
                  .join("")}
              </div>`
            : `<div class="empty"><strong>Nenhuma imagem</strong>Solte arquivos acima${standalone ? "." : ` ou copie para <code>src/thumbs/</code>.`}</div>`
        }
        <div class="toast-stack" id="thumbToastStack"></div>
        <div class="thumb-lightbox" id="thumbLightbox" hidden>
          <button type="button" class="thumb-lightbox-close" id="thumbLbClose" aria-label="Fechar">×</button>
          <img id="thumbLbImg" alt="" />
        </div>
      </div>
    `;

    const addFiles = (fileList) => {
      const files = [...(fileList || [])].filter((f) => f.type.startsWith("image/"));
      if (!files.length) {
        toast("Selecione arquivos de imagem");
        return;
      }
      const next = [...session];
      files.forEach((f) => {
        next.push({
          id: uid("thumb"),
          name: f.name,
          src: URL.createObjectURL(f),
          bundled: false
        });
      });
      setSession(next);
      toast(`${files.length} imagem(ns) adicionada(s)`);
      paint();
    };

    root.querySelector("#thumbPick").onclick = () => root.querySelector("#thumbFiles").click();
    root.querySelector("#thumbFiles").onchange = (e) => {
      addFiles(e.target.files);
      e.target.value = "";
    };

    const drop = root.querySelector("#thumbDrop");
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

    root.querySelector("#thumbClear")?.addEventListener("click", () => {
      session.forEach((t) => {
        try {
          URL.revokeObjectURL(t.src);
        } catch {
          /* ignore */
        }
      });
      setSession([]);
      paint();
    });

    root.querySelectorAll("[data-thumb-rm]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.thumbRm;
        const item = session.find((t) => t.id === id);
        if (item) {
          try {
            URL.revokeObjectURL(item.src);
          } catch {
            /* ignore */
          }
        }
        setSession(session.filter((t) => t.id !== id));
        paint();
      };
    });

    const lb = root.querySelector("#thumbLightbox");
    const lbImg = root.querySelector("#thumbLbImg");
    const closeLb = () => {
      lb.hidden = true;
      lbImg.src = "";
    };
    root.querySelector("#thumbLbClose").onclick = closeLb;
    lb.onclick = (e) => {
      if (e.target === lb) closeLb();
    };
    root.querySelectorAll(".thumb-open").forEach((btn) => {
      btn.onclick = () => {
        lbImg.src = btn.dataset.src;
        lb.hidden = false;
      };
    });
  };

  paint();

  return {
    getSession: () => session,
    destroy: () => {
      root.innerHTML = "";
    }
  };
}
