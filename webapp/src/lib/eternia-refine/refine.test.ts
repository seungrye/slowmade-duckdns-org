// 정제 경제 (#445).
//
// 이 파일은 **변이 시험이 찾아낸 빈자리**다. `refine.ts` 에는 직접 시험이 하나도 없었고
// 완주 시험이 지나가기만 했다 — 커버리지는 초록인데 산술을 아무도 단언하지 않았다.
// 그래서 이런 변이가 전부 살아남았다:
//
//   crystalsLeft - burned  →  + burned      (태웠는데 결정이 **늘어난다**)
//   burned * ETHER_PER_CRYSTAL  →  /        (18배가 18분의 1이 된다)
//   cityPower * ...  →  /                   (도시가 안 자란다)
//
// 셋 다 게임의 중심 거래를 뒤집는 버그인데 시험이 통과했다. 여기서 막는다.
//
// **값 자체는 안 박는다.** `ETHER_PER_CRYSTAL` 을 18 이라고 베껴 적으면 밸런스를 만질
// 때마다 시험이 깨진다. 상수를 그대로 참조해 **관계**를 단언한다.

import { describe, it, expect } from 'vitest';
import {
  refine,
  bossHpBonus,
  ETHER_PER_CRYSTAL,
  ETHER_PER_REMOVAL,
  CITY_POWER_PER_CRYSTAL,
  BOSS_HP_PER_CITY_POWER,
} from './refine';

const at = (over: Partial<Parameters<typeof refine>[0]> = {}) =>
  refine({ crystalsLeft: 4, count: 2, ether: 10, refined: 7, cityPower: 3, ...over });

describe('refine — 태운 만큼 줄고, 태운 만큼 는다', () => {
  it('결정은 **줄어든다**', () => {
    const r = at();
    expect(r.burned).toBe(2);
    expect(r.crystalsLeft).toBe(4 - 2);
    expect(r.crystalsLeft).toBeLessThan(4);
  });

  it('에테르는 장당 상수만큼 는다 — 나누기가 아니라 곱하기다', () => {
    expect(at().ether).toBe(10 + 2 * ETHER_PER_CRYSTAL);
    // 한 장 더 태우면 정확히 한 장치가 더 는다.
    expect(at({ count: 3 }).ether - at({ count: 2 }).ether).toBe(ETHER_PER_CRYSTAL);
  });

  it('도시는 장당 상수만큼 자란다', () => {
    expect(at().cityPower).toBe(3 + 2 * CITY_POWER_PER_CRYSTAL);
    expect(at({ count: 3 }).cityPower - at({ count: 2 }).cityPower).toBe(CITY_POWER_PER_CRYSTAL);
  });

  it('누계는 태운 만큼 쌓인다', () => {
    expect(at().refined).toBe(7 + 2);
  });
});

describe('refine — 가진 것보다 많이 부르면 가진 만큼만', () => {
  it('막지 않고 자른다 — 화면이 상한을 따로 안 챙겨도 되게', () => {
    const r = at({ crystalsLeft: 2, count: 99 });
    expect(r.burned).toBe(2);
    expect(r.crystalsLeft).toBe(0);
    expect(r.ether).toBe(10 + 2 * ETHER_PER_CRYSTAL);
  });

  it('0 이나 음수를 부르면 아무 일도 안 일어난다', () => {
    for (const count of [0, -1, -99]) {
      const r = at({ count });
      expect(r.burned, `count ${count}`).toBe(0);
      expect(r.crystalsLeft).toBe(4);
      expect(r.ether).toBe(10);
      expect(r.cityPower).toBe(3);
    }
  });

  it('결정이 없으면 태울 것도 없다', () => {
    expect(at({ crystalsLeft: 0, count: 3 })).toMatchObject({ burned: 0, crystalsLeft: 0 });
  });
});

describe('bossHpBonus — 대가를 미리 보여 주는 숫자', () => {
  it('도시 1 마다 상수만큼 무거워진다', () => {
    expect(bossHpBonus(1)).toBe(BOSS_HP_PER_CITY_POWER);
    expect(bossHpBonus(5) - bossHpBonus(4)).toBe(BOSS_HP_PER_CITY_POWER);
    expect(bossHpBonus(5)).toBeGreaterThan(bossHpBonus(4));
  });

  it('안 팔았으면 0, 음수는 0 — 보스가 가벼워지는 길은 없다', () => {
    expect(bossHpBonus(0)).toBe(0);
    expect(bossHpBonus(-3)).toBe(0);
  });
});

describe('거래가 한눈에 읽히는가 (#439)', () => {
  it('결정 하나치 에테르 = 카드 하나 지우는 값', () => {
    // 이 등식이 깨지면 정제소 문구("한 장에 에테르 18")가 거짓말이 된다.
    expect(ETHER_PER_REMOVAL).toBe(ETHER_PER_CRYSTAL);
  });

  it('한 장을 태우면 지울 돈이 정확히 한 장치 생긴다 — 그리고 보스가 그만큼 무거워진다', () => {
    const before = at({ crystalsLeft: 1, count: 0, ether: 0, cityPower: 0 });
    const after = at({ crystalsLeft: 1, count: 1, ether: 0, cityPower: 0 });
    expect(after.ether - before.ether).toBe(ETHER_PER_REMOVAL);
    expect(bossHpBonus(after.cityPower)).toBeGreaterThan(bossHpBonus(before.cityPower));
  });
});
