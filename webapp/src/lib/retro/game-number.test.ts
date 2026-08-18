// netplay 용 게임 번호 (#186).
//
// EmulatorJS 는 `EJS_gameID` 가 **숫자**일 때만 netplay 를 켠다
// (`typeof this.config.gameId !== "number"` 면 꺼짐). 우리 게임 키는 `rom:<ObjectId>` ·
// `builtin:<슬러그>` 라 숫자로 옮겨야 한다.
//
// 이 함수의 계약은 하나다 — **두 PC 가 같은 게임에서 같은 수를 뽑아야 한다.** 그래야 같은
// 방에 들어간다. 그래서 시각·난수·환경에 절대 기대지 않는다.
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

  // EmulatorJS 가 typeof 로 거른다 — 안전한 정수여야 한다.
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
