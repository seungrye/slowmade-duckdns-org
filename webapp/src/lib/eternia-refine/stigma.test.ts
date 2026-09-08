// 침식 규칙 (#419) — A안(별도)과 B안(엔진 공유)의 **공통 명세**.
//
// 이 게임의 심장이다. 강해지려면 성흔을 써야 하고, 쓰면 침식이 오르고, 침식이 오르면
// 덱이 결정으로 막힌다. 그 셋의 관계를 여기서 못 박는다.
//
// **두 구현이 같은 시험을 함께 통과한다.** 그게 이 비교의 전제다 — 규칙이 다르면
// 코드량이나 결합점을 비교해 봐야 사과와 오렌지다. 한쪽만 깨지면 그 순간 갈라진 것이다.

import { describe, it, expect } from 'vitest';
import * as own from './stigma';
import * as shared from './stigma-shared';

const IMPLS = [
  ['A안 별도', own],
  ['B안 공유', shared],
] as const;

describe.each(IMPLS)('%s', (_name, m) => {
  describe('applyErosion', () => {
    it('더하고 0..100 으로 자른다', () => {
      expect(m.applyErosion(36, 12)).toBe(48);
      expect(m.applyErosion(95, 20)).toBe(m.EROSION_MAX);
      expect(m.applyErosion(4, -20)).toBe(0);
    });

    it('무흔은 침식이 오르지 않는다 — 마력을 거절한 자라서', () => {
      expect(m.applyErosion(36, 12, 'none')).toBe(36);
    });

    it('무흔도 내려가는 것은 받는다 — 정제수를 못 쓸 이유는 없다', () => {
      expect(m.applyErosion(36, -6, 'none')).toBe(30);
    });

    it('NaN·Infinity 를 막는다 — 카드 데이터가 깨져도 회차가 죽지 않게', () => {
      expect(m.applyErosion(36, Number.NaN)).toBe(36);
      expect(m.applyErosion(36, Number.POSITIVE_INFINITY)).toBe(m.EROSION_MAX);
    });
  });

  describe('crystalsGained — 결정선', () => {
    it('결정선을 넘은 수만큼 준다', () => {
      expect(m.crystalsGained(36, 48)).toBe(1); // 40 하나 넘음
      expect(m.crystalsGained(36, 39)).toBe(0); // 아직
      expect(m.crystalsGained(36, 62)).toBe(2); // 40, 60 둘
    });

    it('내려갈 때는 주지 않는다 — 정제수로 침식을 내려도 결정이 생기면 안 된다', () => {
      expect(m.crystalsGained(62, 36)).toBe(0);
    });

    it('억제기를 차면 간격이 벌어진다', () => {
      expect(m.crystalsGained(0, 27, 28)).toBe(0);
      expect(m.crystalsGained(0, 28, 28)).toBe(1);
    });
  });

  describe('isPetrified', () => {
    it('100 에 닿으면 석화', () => {
      expect(m.isPetrified(99)).toBe(false);
      expect(m.isPetrified(m.EROSION_MAX)).toBe(true);
    });

    it('무흔은 석화하지 않는다 — 성흔이 없으니 굳을 것도 없다', () => {
      expect(m.isPetrified(m.EROSION_MAX, 'none')).toBe(false);
    });
  });

  describe('erosionDebuff', () => {
    it('50 이상이면 -2', () => {
      expect(m.erosionDebuff(49)).toBe(0);
      expect(m.erosionDebuff(50)).toBe(-2);
    });
  });

  describe('effectiveDamage — 셀레네는 굳을수록 세진다', () => {
    it('scaling 이 없으면 고정 피해 그대로', () => {
      expect(m.effectiveDamage({ damage: 16 }, 88, 'lunar')).toBe(16);
    });

    it('셀레네면 침식 ÷ scaling 만큼 더한다', () => {
      expect(m.effectiveDamage({ damage: 9, scaling: 10 }, 88, 'selene')).toBe(17);
      expect(m.effectiveDamage({ damage: 9, scaling: 10 }, 36, 'selene')).toBe(12);
    });

    it('셀레네가 아니면 scaling 이 붙지 않는다 — 성흔이 곧 그 카드의 자격이다', () => {
      expect(m.effectiveDamage({ damage: 9, scaling: 10 }, 88, 'lunar')).toBe(9);
    });
  });

  describe('bonusDraw — 루나는 침식에서 지식을 읽는다', () => {
    it('루나는 25 마다 1장 더', () => {
      expect(m.bonusDraw(24, 'lunar')).toBe(0);
      expect(m.bonusDraw(50, 'lunar')).toBe(2);
    });

    it('다른 성흔은 없다', () => {
      expect(m.bonusDraw(88, 'selene')).toBe(0);
      expect(m.bonusDraw(88, 'none')).toBe(0);
    });
  });
});

/**
 * 변경 추종 — 이 비교의 핵심 실험 (#419).
 *
 * B안은 임계값을 web-adventure 에서 가져오므로, CYOA 가 규칙을 바꾸면 **따라온다.**
 * A안은 자기 상수라 따라오지 않는다. 어느 쪽이 옳은지는 상황에 달렸다 — 따라오는 것이
 * 이득일 수도(한 곳만 고치면 된다), 손해일 수도(카드 밸런스가 CYOA 사정으로 흔들린다) 있다.
 * 여기서는 **그 연결이 실제로 살아 있다는 것**만 못 박는다.
 */
describe('변경 추종 — B안만 CYOA 임계값을 따라간다', () => {
  it('B안의 상수는 web-adventure 에서 온다', async () => {
    const wa = await import('@/lib/web-adventure/engine/stigma');
    expect(shared.EROSION_MAX).toBe(wa.STIGMA_MAX);
    expect(shared.EROSION_DEBUFF_AT).toBe(wa.STIGMA_DEBUFF_THRESHOLD);
  });

  it('A안의 상수는 자기 것이다 — 지금은 값이 같지만 출처가 다르다', () => {
    expect(own.EROSION_MAX).toBe(100);
    expect(own.EROSION_DEBUFF_AT).toBe(50);
  });
});
