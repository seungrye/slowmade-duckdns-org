import { describe, it, expect } from 'vitest';
import { builtinKey, parseGameKey, romKey } from './game-key';
import { BUILTIN_GAMES } from './library';

const ROM_ID = '653f1a2b3c4d5e6f70819202';
const SLUG = BUILTIN_GAMES[0].slug;

describe('retro/game-key', () => {
  it('키를 만든다', () => {
    expect(builtinKey('nomolos')).toBe('builtin:nomolos');
    expect(romKey(ROM_ID)).toBe(`rom:${ROM_ID}`);
  });

  it('기본 제공 게임 키를 읽는다', () => {
    expect(parseGameKey(`builtin:${SLUG}`)).toEqual({ kind: 'builtin', slug: SLUG });
  });

  it('업로드 롬 키를 읽는다', () => {
    expect(parseGameKey(`rom:${ROM_ID}`)).toEqual({ kind: 'rom', id: ROM_ID });
  });

  it('매니페스트에 없는 slug 는 거부한다 — 아무 문자열이나 받으면 무료 파일 저장소가 된다', () => {
    expect(parseGameKey('builtin:없는게임')).toBeNull();
    expect(parseGameKey('builtin:')).toBeNull();
  });

  it('ObjectId 형식이 아닌 롬 id 는 거부한다', () => {
    expect(parseGameKey('rom:not-an-id')).toBeNull();
    expect(parseGameKey('rom:')).toBeNull();
  });

  it.each([
    ['', '빈 값'],
    ['nomolos', '접두사 없음'],
    ['other:nomolos', '모르는 접두사'],
    ['builtin:../../etc/passwd', '경로 탈출'],
    [`builtin:${SLUG}:extra`, '조각이 더 붙음'],
    ['BUILTIN:' + SLUG, '대문자 접두사'],
  ])('%s 는 거부한다 (%s)', (key) => {
    expect(parseGameKey(key)).toBeNull();
  });

  it('만든 키는 다시 읽힌다 — 왕복이 맞는다', () => {
    for (const g of BUILTIN_GAMES) {
      expect(parseGameKey(builtinKey(g.slug))).toEqual({ kind: 'builtin', slug: g.slug });
    }
    expect(parseGameKey(romKey(ROM_ID))).toEqual({ kind: 'rom', id: ROM_ID });
  });
});
