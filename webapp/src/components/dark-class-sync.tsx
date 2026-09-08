'use client';

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Theme, readStoredTheme, storeTheme, applyTheme } from "@/lib/theme";

/**
 * Theme (dark mode) synchronisation - client only.
 *
 * The initial theme is read from localStorage (on mount), and under system it reacts to prefers-color-scheme
 * changes. For a logged-in user localStorage is refreshed from the DB (user.settings.theme) as the source.
 * The server render stays static without knowing the theme, and FOUC is prevented before hydration by
 * THEME_INIT_SCRIPT (a synchronous inline script) in the layout's <head>.
 */
export default function ThemeSync() {
  const { status } = useSession();
  const themeRef = useRef<Theme>('system');

  // On mount: localStorage's initial theme is applied plus a listener for system changes.
  useEffect(() => {
    const stored = readStoredTheme();
    themeRef.current = stored;
    applyTheme(stored);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (themeRef.current === 'system') {
        document.documentElement.classList.toggle('dark', e.matches);
      }
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Logged in: localStorage is refreshed from the DB's theme and applied at once.
  useEffect(() => {
    if (status !== 'authenticated') return;

    fetch('/api/user/settings')
      .then((r) => r.json())
      .then((data) => {
        const theme: Theme = data.data?.theme ?? 'system';
        themeRef.current = theme;
        storeTheme(theme);
        applyTheme(theme);
      })
      .catch(() => {});
  }, [status]);

  return null;
}
