/** Registro PWA (vite-plugin-pwa). */
import { registerSW } from "virtual:pwa-register";

export function registerPwa() {
  const toast = (msg: string) => {
    const stack = document.getElementById("toastStack");
    if (!stack) return;
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  };

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast("Nova versão disponível — recarregue a página");
    },
    onOfflineReady() {
      toast("VoltES pronto para uso offline");
    }
  });

  let deferredPrompt: any = null;
  window.addEventListener("beforeinstallprompt", (e: Event) => {
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
    const btn = (e.target as HTMLElement)?.closest?.("#installPwaBtn");
    if (!btn || !deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    (btn as HTMLElement).hidden = true;
  });

  window.addEventListener("DOMContentLoaded", () => {
    const hash = (location.hash || "").replace("#", "");
    if (!hash) return;
    setTimeout(() => {
      const nav = document.querySelector(`.nav-item[data-view="${hash}"]`) as HTMLElement | null;
      nav?.click();
    }, 80);
  });

  return updateSW;
}
