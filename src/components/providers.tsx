'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import { ReactNode, useEffect } from 'react';

/**
 * 세션에서 테마를 읽어와 전역적으로 적용하는 내부 컴포넌트
 */
function ThemeInjector({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();

  useEffect(() => {
    // 세션 로딩 중에는 테마 변경을 시도하지 않습니다.
    if (status === 'loading') {
      return console.log('세션 로딩 중...');
    }

    const theme = session?.user?.theme || 'system';
    const root = window.document.documentElement;

    const applyTheme = (newTheme: 'light' | 'dark') => {
      root.classList.remove('dark'); // 먼저 dark 클래스를 제거
      if (newTheme === 'dark') {
        root.classList.add('dark');
      }
    };

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      applyTheme(systemTheme);

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        // 사용자의 테마 설정이 'system'일 때만 OS 설정 변경에 반응합니다.
        if (session?.user?.theme === 'system' || !session?.user?.theme) {
            applyTheme(e.matches ? 'dark' : 'light');
        }
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      applyTheme(theme);
    }
  }, [session?.user?.theme, status]);

  return <>{children}</>;
}

/**
 * 클라이언트 측 Provider들을 하나로 묶어 내보내는 컴포넌트.
 * Root Layout (서버 컴포넌트)에서 이 컴포넌트를 사용합니다.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeInjector>{children}</ThemeInjector>
    </SessionProvider>
  );
}