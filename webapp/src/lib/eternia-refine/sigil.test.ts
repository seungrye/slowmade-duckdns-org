// 문양이 카드에서만 나오는가 (#475).
//
// 이 문양의 값어치는 두 가지다 — **같은 카드는 늘 같은 모양**이고,
// **숫자가 모양으로 읽힌다**(침식이 크면 눈금이 촘촘하다). 둘 다 여기서 못 박는다.
//
// 난수가 섞이면 첫째가 깨지고, 매핑이 느슨하면 둘째가 깨진다.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAX_SPOKES, MAX_TICKS, coreOf, polygonPoints, sigilSpec, spin } from './sigil';
import { STARTER, POOL } from './content';
import { crystalCard } from './combat';
import type { Card } from './types';

const byName = (name: string): Card =>
  [...STARTER, ...POOL].find((c) => c.name === name)!;

describe('난수를 안 쓴다 — 같은 카드는 늘 같은 문양', () => {
  it('두 번 불러도 같다', () => {
    for (const c of [...STARTER, ...POOL]) {
      expect(sigilSpec(c)).toEqual(sigilSpec(c));
    }
  });

  it('spin 은 이름에서만 나온다', () => {
    expect(spin('메스')).toBe(spin('메스'));
    expect(spin('메스')).not.toBe(spin('웅크린다'));
  });

  it('코드에 Math.random 이 없다 — 실수로 섞이면 저장·복원에서 문양이 흔들린다', () => {
    // 주석은 뺀다 — 이 파일의 머리말이 「Math.random 을 쓰지 않는다」고 적고 있어서
    // 그대로 훑으면 제 설명에 걸린다(실제로 걸렸다).
    const code = readFileSync(new URL('./sigil.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/Math\.random/);
    expect(code).toMatch(/export function sigilSpec/); // 주석만 남기고 다 지운 건 아닌지
  });
});

describe('숫자가 모양이 된다', () => {
  it('침식이 클수록 눈금이 많다', () => {
    const 각인 = sigilSpec(byName('달의 각인')); // 침식 10
    const 과부하 = sigilSpec(byName('과부하')); // 침식 22
    const 메스 = sigilSpec(byName('메스')); // 침식 0
    expect(메스.ticks).toBe(0);
    expect(각인.ticks).toBeGreaterThan(메스.ticks);
    expect(과부하.ticks).toBeGreaterThan(각인.ticks);
  });

  it('눈금에 상한이 있다 — 침식 100 이 와도 테두리가 안 뭉개진다', () => {
    const huge: Card = { ...byName('과부하'), erosion: 100 };
    expect(sigilSpec(huge).ticks).toBe(MAX_TICKS);
  });

  it('비용이 살의 수다', () => {
    expect(sigilSpec(byName('메스')).spokes).toBe(1); // 비용 1
    expect(sigilSpec(byName('셀레네의 완력')).spokes).toBe(2); // 비용 2
    expect(sigilSpec(byName('현장 정제')).spokes).toBe(0); // 비용 0
  });

  it('살에도 상한이 있다', () => {
    const pricey: Card = { ...byName('메스'), cost: 99 };
    expect(sigilSpec(pricey).spokes).toBe(MAX_SPOKES);
  });

  it('뽑는 장수가 바깥 띠의 위성이 된다', () => {
    expect(sigilSpec(byName('달의 각인')).band).toMatchObject({ satellites: 1 });
    expect(sigilSpec(byName('세 달의 정렬')).band).toMatchObject({ satellites: 2 });
  });

  it('쓰면 사라지는 카드는 바깥 띠가 끊긴다', () => {
    expect(sigilSpec(byName('기꺼이 타오른다')).band).toMatchObject({ dashed: true });
  });

  it('손을 안 벗어나는 카드는 바깥 띠가 없다', () => {
    expect(sigilSpec(byName('메스')).band).toBeNull();
    expect(sigilSpec(byName('웅크린다')).band).toBeNull();
  });
});

describe('계열이 선의 성격을 정한다', () => {
  it('성흔은 테가 두 겹', () => {
    expect(sigilSpec(byName('달의 각인')).rim).toMatchObject({ double: true, dashed: false });
    expect(sigilSpec(byName('달의 각인')).tone).toBe('stigma');
  });

  it('도구는 홑겹', () => {
    expect(sigilSpec(byName('메스')).rim).toMatchObject({ double: false, dashed: false });
    expect(sigilSpec(byName('메스')).tone).toBe('tool');
  });

  it('결정은 테가 끊긴다', () => {
    const spec = sigilSpec(crystalCard(1));
    expect(spec.rim).toMatchObject({ dashed: true });
    expect(spec.tone).toBe('crystal');
    expect(spec.core).toBe('crystal');
  });
});

describe('coreOf — 주효과가 도형을 고른다', () => {
  it('피해는 blade, 방어는 ward, 회복은 vessel, 완화는 spring', () => {
    expect(coreOf(byName('메스'))).toBe('blade');
    expect(coreOf(byName('웅크린다'))).toBe('ward');
    expect(coreOf(byName('군용 붕대'))).toBe('vessel');
    expect(coreOf(byName('에테르 정제수'))).toBe('spring');
  });

  it('침식 비례 피해도 blade 다 — damage 가 0이어도 때리는 카드다', () => {
    expect(coreOf(byName('셀레네의 완력'))).toBe('blade');
  });

  it('결정을 자원으로 쓰는 카드는 lattice — 방어보다 이쪽이 그 카드의 정체다', () => {
    expect(coreOf(byName('굳은 손'))).toBe('lattice');
  });

  it('숫자가 하나도 없으면 mark 로 물러선다 — 새 카드가 와도 안 비어 보인다', () => {
    const plain: Card = { id: 'x', name: '무명', text: '', kind: 'tool', cost: 1, erosion: 0 };
    expect(coreOf(plain)).toBe('mark');
  });
});

describe('기하 보조', () => {
  it('정삼각형은 점 셋, 정육각형은 점 여섯', () => {
    expect(polygonPoints(3, 20).split(' ')).toHaveLength(3);
    expect(polygonPoints(6, 20).split(' ')).toHaveLength(6);
  });

  it('회전을 줘도 점 수는 그대로고 좌표만 달라진다', () => {
    expect(polygonPoints(4, 20, 0)).not.toBe(polygonPoints(4, 20, 0.5));
    expect(polygonPoints(4, 20, 0.5).split(' ')).toHaveLength(4);
  });

  it('모든 점이 100×100 안에 있다 — viewBox 를 안 넘는다', () => {
    for (const n of [3, 4, 5, 6]) {
      for (const p of polygonPoints(n, 46, 1.1).split(' ')) {
        const [x, y] = p.split(',').map(Number);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('실제 덱 전부가 문양을 받는다', () => {
  it('빠지는 카드가 없다 — 새 카드를 넣어도 저절로 생긴다', () => {
    for (const c of [...STARTER, ...POOL, crystalCard(0)]) {
      const spec = sigilSpec(c);
      expect(spec.core).toBeTruthy();
      expect(spec.ticks).toBeGreaterThanOrEqual(0);
      expect(spec.spokes).toBeGreaterThanOrEqual(0);
    }
  });

  it('시작 덱에서 이름이 다르면 문양도 다르다 — 헷갈리면 안 된다', () => {
    const names = [...new Set(STARTER.map((c) => c.name))];
    const specs = names.map((n) => JSON.stringify(sigilSpec(byName(n))));
    expect(new Set(specs).size).toBe(names.length);
  });
});
