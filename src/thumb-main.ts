import "./styles/index.css";
import { initTheme, cycleTheme, getTheme } from "./ui/themes";
import { mountThumbGallery } from "./ui/thumb-gallery";
import { APP_VERSION } from "./version";

initTheme();

function toast(msg: string) {
  const stack = document.getElementById("toastStack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

const root = document.getElementById("content");
if (root) {
  mountThumbGallery(root, { toast, standalone: true });
}

document.getElementById("themeToggle")?.addEventListener("click", () => {
  cycleTheme();
  syncThemeIcon();
});

function syncThemeIcon() {
  const dark = getTheme() === "dark";
  const iDark = document.querySelector(".theme-icon-dark");
  const iLight = document.querySelector(".theme-icon-light");
  if (iDark) (iDark as HTMLElement).hidden = !dark;
  if (iLight) (iLight as HTMLElement).hidden = dark;
}
syncThemeIcon();

const ver = document.getElementById("appVersion");
if (ver) ver.textContent = `v${APP_VERSION}`;

console.info(`VoltES Thumb ${APP_VERSION}`);
