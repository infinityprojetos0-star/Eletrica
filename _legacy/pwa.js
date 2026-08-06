(() => {
  const isLocal =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.protocol === "https:" ||
    location.protocol === "http:";

  if (!("serviceWorker" in navigator) || !isLocal) return;

  const toast = (msg) => {
    const stack = document.getElementById("toastStack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  };

  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./sw.js", { scope: "./" });

      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            toast("Nova versão disponível — recarregue a página");
          }
        });
      });
    } catch (err) {
      console.warn("PWA: falha ao registrar service worker", err);
    }
  });

  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById("installPwaBtn");
    if (btn) btn.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    const btn = document.getElementById("installPwaBtn");
    if (btn) btn.hidden = true;
    toast("VoltES instalado neste dispositivo");
  });

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("#installPwaBtn");
    if (!btn || !deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    btn.hidden = true;
  });

  // Deep-link por hash (#orcamentos, #servicos…)
  window.addEventListener("DOMContentLoaded", () => {
    const hash = (location.hash || "").replace("#", "");
    if (!hash) return;
    const tryNavigate = () => {
      const nav = document.querySelector(`.nav-item[data-view="${hash}"]`);
      if (nav) nav.click();
    };
    setTimeout(tryNavigate, 80);
  });
})();
