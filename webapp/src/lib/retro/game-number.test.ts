// The game number for netplay (#186).
//
// EmulatorJS enables netplay only when `EJS_gameID` is **a number**
// (`typeof this.config.gameId !== "number"` turns it off). Our game keys are `rom:<ObjectId>` and
// `builtin:<slug>`, so they have to be mapped to a number.
//
// This function has one contract - **two PCs must derive the same number for the same game.** That is what puts them
// in the same room. So it never relies on the clock, randomness or the environment.
import { describe, it, expect } from 'vitest';
import { gameNumberOf } from './game-number';

describe('gameNumberOf', () => {
  it('같은 키는 언제나 같은 수 — 두 PC 가 같은 방에 들어가는 근거', () => {
    const a = gameNumberOf('rom:6a7c88d9b25ae2b9a7972b8e');
    const b = gameNumberOf('rom:6a7c88d9b25ae2b9a7972b8e');
    expect(a).toBe(b);
  });

  it('다른 게임은 다른 수', () => {
    const keys = [
      'rom:6a7c88d9b25ae2b9a7972b8e',
      'rom:6a7dbd88c489b3ebbbbed756',
      'builtin:lan-master',
      'builtin:super-boss-gaiden',
    ];
    expect(new Set(keys.map(gameNumberOf)).size).toBe(keys.length);
  });

  it('한 글자만 달라도 갈린다', () => {
    expect(gameNumberOf('rom:aaaaaaaaaaaaaaaaaaaaaaaa'))
      .not.toBe(gameNumberOf('rom:aaaaaaaaaaaaaaaaaaaaaaab'));
  });

  // EmulatorJS filters on typeof - it must be a safe integer.
  it('항상 안전한 양의 정수', () => {
    for (const k of ['rom:abc', 'builtin:x', '', 'r'.repeat(500), '한글 키', '🎮']) {
      const n = gameNumberOf(k);
      expect(typeof n).toBe('number');
      expect(Number.isSafeInteger(n)).toBe(true);
      expect(n).toBeGreaterThan(0);
    }
  });

  it('빈 키도 터지지 않는다', () => {
    expect(() => gameNumberOf('')).not.toThrow();
  });

  it('유니코드 키도 안정적이다 — 브라우저마다 같은 수가 나와야 한다', () => {
    expect(gameNumberOf('게임🎮')).toBe(gameNumberOf('게임🎮'));
  });
});
