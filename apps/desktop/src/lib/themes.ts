export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "narciph.theme";

export const THEME_OPTIONS: { value: ThemeMode; labelKey: string }[] = [
  { value: "system", labelKey: "common.themeSystem" },
  { value: "light", labelKey: "common.themeLight" },
  { value: "dark", labelKey: "common.themeDark" },
];

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "light" || mode === "dark") return mode;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function readStoredTheme(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    return "system";
  }
  return "system";
}

export function storeTheme(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    return;
  }
}

export function applyThemeClass(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  return resolved;
}

export function withThemeTransition(mutate: () => void): void {
  if (typeof document === "undefined") {
    mutate();
    return;
  }
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => unknown;
  };
  if (reduced || typeof doc.startViewTransition !== "function") {
    mutate();
    return;
  }
  doc.startViewTransition(mutate);
}
