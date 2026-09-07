// Centralising the theme (dark mode) utilities.
//
// SSR-ing the theme from a cookie in the root layout forces the whole site into dynamic rendering.
// To avoid that, the theme is managed on the client (localStorage plus a <head> inline script) and the
// server render stays static, knowing nothing of the theme. The DB (user.settings.theme) remains the source of
// truth for logged-in users, and ThemeSync syncs it into localStorage.

export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'theme';
export const THEMES: readonly Theme[] = ['light', 'dark', 'system'];

export function isValidTheme(v: unknown): v is Theme {
  return v === 'light' || v === 'dark' || v === 'system';
}

/** The stored theme plus the system dark preference -> whether dark applies (pure). */
export function shouldUseDark(theme: Theme, systemPrefersDark: boolean): boolean {
  return theme === 'dark' || (theme === 'system' && systemPrefersDark);
}

/** Reads the theme from localStorage. Absent or odd gives 'system'. A failed access falls back safely too. */
export function readStoredTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return isValidTheme(t) ? t : 'system';
  } catch {
    return 'system';
  }
}

/** Stores the theme in localStorage. Failures are swallowed. */
export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage 접근 불가(사파리 프라이빗 등) — 무시 */
  }
}

/** Toggles the html.dark class for the current theme (browser only). */
export function applyTheme(theme: Theme): void {
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', shouldUseDark(theme, systemPrefersDark));
}

/**
 * The anti-FOUC script that runs synchronously (blocking) at the very top of <head>.
 * Before hydration it reads the theme from localStorage and sets html.dark (branching on light/dark/system).
 * It expresses the same rule as shouldUseDark, inline.
 */
export const THEME_INIT_SCRIPT =
  `(function(){try{` +
  `var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';` +
  `var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme:dark)').matches);` +
  `if(d)document.documentElement.classList.add('dark');` +
  `else document.documentElement.classList.remove('dark');` +
  `}catch(e){}})();`;
