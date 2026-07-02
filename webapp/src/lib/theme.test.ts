// 테마 유틸 — 쿠키 SSR → localStorage + inline script 리팩터의 순수/DOM 로직.
// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  shouldUseDark,
  isValidTheme,
  readStoredTheme,
  storeTheme,
  applyTheme,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from './theme';

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

describe('shouldUseDark (순수)', () => {
  it("'dark' 는 시스템 선호와 무관하게 true", () => {
    expect(shouldUseDark('dark', false)).toBe(true);
    expect(shouldUseDark('dark', true)).toBe(true);
  });
  it("'light' 는 항상 false", () => {
    expect(shouldUseDark('light', true)).toBe(false);
    expect(shouldUseDark('light', false)).toBe(false);
  });
  it("'system' 은 시스템 선호를 따른다", () => {
    expect(shouldUseDark('system', true)).toBe(true);
    expect(shouldUseDark('system', false)).toBe(false);
  });
});

describe('isValidTheme', () => {
  it('유효한 값', () => {
    (['light', 'dark', 'system'] as const).forEach((t) => expect(isValidTheme(t)).toBe(true));
  });
  it('무효한 값', () => {
    [null, undefined, '', 'weird', 1, {}].forEach((v) => expect(isValidTheme(v)).toBe(false));
  });
});

describe('readStoredTheme / storeTheme', () => {
  beforeEach(() => localStorage.clear());
  it('저장값이 없으면 system 으로 폴백', () => {
    expect(readStoredTheme()).toBe('system');
  });
  it('저장한 값을 읽는다', () => {
    storeTheme('dark');
    expect(readStoredTheme()).toBe('dark');
  });
  it('저장값이 이상하면 system 으로 폴백', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'weird');
    expect(readStoredTheme()).toBe('system');
  });
});

describe('applyTheme (DOM)', () => {
  beforeEach(() => document.documentElement.classList.remove('dark'));
  it("'dark' → html.dark 추가", () => {
    stubMatchMedia(false);
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
  it("'light' → html.dark 제거", () => {
    stubMatchMedia(true);
    document.documentElement.classList.add('dark');
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
  it("'system' + 시스템 dark → html.dark 추가", () => {
    stubMatchMedia(true);
    applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

describe('THEME_INIT_SCRIPT', () => {
  it('localStorage 와 prefers-color-scheme 를 참조하는 IIFE 문자열', () => {
    expect(THEME_INIT_SCRIPT).toContain('localStorage');
    expect(THEME_INIT_SCRIPT).toContain('prefers-color-scheme');
    expect(THEME_INIT_SCRIPT).toMatch(/^\(function\(\)\s*\{/);
    // try/catch 로 감싸 예외를 삼킨다(스토리지 접근 실패해도 렌더 진행).
    expect(THEME_INIT_SCRIPT).toContain('catch');
  });
});
