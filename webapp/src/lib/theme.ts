// 테마(다크모드) 유틸 중앙화.
//
// 루트 layout 이 테마를 쿠키로 SSR 하면 사이트 전역이 동적 렌더링으로 강제된다.
// 이를 피하기 위해 테마는 client(localStorage + <head> inline script)로 관리하고,
// 서버 렌더는 테마를 모른 채 정적으로 남긴다. DB(user.settings.theme)는 로그인 사용자의
// 원본으로 남아 ThemeSync 가 localStorage 로 동기화한다.

export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'theme';
export const THEMES: readonly Theme[] = ['light', 'dark', 'system'];

export function isValidTheme(v: unknown): v is Theme {
  return v === 'light' || v === 'dark' || v === 'system';
}

/** 저장된 테마 + 시스템 dark 선호 여부 → 최종 dark 적용 여부 (순수). */
export function shouldUseDark(theme: Theme, systemPrefersDark: boolean): boolean {
  return theme === 'dark' || (theme === 'system' && systemPrefersDark);
}

/** localStorage 에서 테마를 읽는다. 없거나 이상하면 'system'. 접근 실패도 안전 폴백. */
export function readStoredTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return isValidTheme(t) ? t : 'system';
  } catch {
    return 'system';
  }
}

/** 테마를 localStorage 에 저장. 실패는 삼킨다. */
export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage 접근 불가(사파리 프라이빗 등) — 무시 */
  }
}

/** 현재 theme 로 html.dark 클래스를 토글한다(브라우저 전용). */
export function applyTheme(theme: Theme): void {
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', shouldUseDark(theme, systemPrefersDark));
}

/**
 * <head> 최상단에 동기(blocking) 실행되는 FOUC 방지 스크립트.
 * hydration 전에 localStorage 테마를 읽어 html.dark 를 설정한다(light/dark/system 3분기).
 * shouldUseDark 와 동일한 규칙을 인라인으로 표현한다.
 */
export const THEME_INIT_SCRIPT =
  `(function(){try{` +
  `var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'system';` +
  `var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme:dark)').matches);` +
  `if(d)document.documentElement.classList.add('dark');` +
  `else document.documentElement.classList.remove('dark');` +
  `}catch(e){}})();`;
