'use client';

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

type Theme = 'light' | 'dark' | 'system';

function applyTheme(theme: Theme, mq: MediaQueryList) {
  const dark = theme === 'dark' || (theme === 'system' && mq.matches);
  document.documentElement.classList.toggle('dark', dark);
}

export default function ThemeSync({ initialTheme }: { initialTheme: Theme }) {
  const { status } = useSession();
  const themeRef = useRef<Theme>(initialTheme);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      if (themeRef.current === 'system') {
        document.documentElement.classList.toggle('dark', e.matches);
      }
    };

    if (initialTheme === 'system') {
      document.documentElement.classList.toggle('dark', mq.matches);
    }

    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [initialTheme]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    fetch('/api/user/settings')
      .then((r) => r.json())
      .then((data) => {
        const theme: Theme = data.data?.theme ?? 'system';
        themeRef.current = theme;
        document.cookie = `theme=${theme};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
        applyTheme(theme, window.matchMedia('(prefers-color-scheme: dark)'));
      });
  }, [status]);

  return null;
}
