/** Temas claro / escuro — paleta da marca VoltES. */

export type ThemeId = "dark" | "light";

const STORAGE_KEY = "voltes-theme";

export function getPreferredTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && window.matchMedia) {
    if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  }
  return "dark";
}

export function getTheme(): ThemeId {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return getPreferredTheme();
}

export function setTheme(theme: ThemeId) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "light" ? "#1a5695" : "#0a1628");
  }
  window.dispatchEvent(new CustomEvent("voltes-theme", { detail: theme }));
}

export function cycleTheme(): ThemeId {
  const next: ThemeId = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

export function initTheme() {
  setTheme(getPreferredTheme());
}
