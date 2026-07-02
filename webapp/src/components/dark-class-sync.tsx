'use client';

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Theme, readStoredTheme, storeTheme, applyTheme } from "@/lib/theme";

/**
 * 테마(다크모드) 동기화 — client 전용.
 *
 * 초기 테마는 localStorage 에서 읽고(마운트 시), system 이면 prefers-color-scheme
 * 변화에 반응한다. 로그인 사용자는 DB(user.settings.theme)를 원본으로 localStorage 를
 * 갱신한다. 서버 렌더는 테마를 모른 채 정적으로 남고, FOUC 는 layout <head> 의
 * THEME_INIT_SCRIPT(동기 인라인)가 hydration 전에 막는다.
 */
export default function ThemeSync() {
  const { status } = useSession();
  const themeRef = useRef<Theme>('system');

  // 마운트: localStorage 초기 테마 적용 + system 변화 리스너.
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

  // 로그인: DB 테마를 원본으로 localStorage 갱신 + 즉시 적용.
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
