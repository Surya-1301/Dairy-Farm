const THEME_STORAGE_KEY = "dairy-farm-theme";
const THEME_CHANGE_EVENT = "dairy-farm-theme-changed";

export type Theme = "light" | "dark";

function canUseDom() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function getStoredTheme(): Theme | null {
  if (!canUseDom()) return null;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "dark" || stored === "light" ? stored : null;
}

function getSystemTheme(): Theme {
  if (!canUseDom() || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeClass(theme: Theme) {
  if (!canUseDom()) return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

let currentTheme: Theme = getStoredTheme() ?? getSystemTheme();

/**
 * Applies the persisted (or system-default) theme immediately. Call this as
 * early as possible (e.g. at the top of main.tsx) so there is no flash of
 * the wrong theme before React mounts.
 */
export function initTheme() {
  applyThemeClass(currentTheme);
  return currentTheme;
}

export function getTheme(): Theme {
  return currentTheme;
}

export function setTheme(theme: Theme) {
  currentTheme = theme;
  applyThemeClass(theme);
  if (canUseDom()) {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }
}

export function toggleTheme() {
  setTheme(currentTheme === "dark" ? "light" : "dark");
}

export function subscribeTheme(listener: () => void) {
  if (!canUseDom()) return () => {};
  const onChange = () => listener();
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}
