// 변종 이름의 단일 출처가 정말 단일한가 (#475).
//
// 여기서 보는 것은 «아홉 개가 빠짐없이 나오는가»와 «모르는 값을 안 받는가»다.
// 이 목록이 화면·저장·분석·e2e 의 기준이라, 하나라도 새면 시험이 거짓으로 통과한다.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VARIANT,
  FACES,
  LAYOUTS,
  VARIANTS,
  parseVariant,
  variantLabel,
} from './ui-variant';

describe('VARIANTS — 두 축의 모든 짝', () => {
  it('배치 3 × 앞면 3 = 9개다', () => {
    expect(LAYOUTS).toHaveLength(3);
    expect(FACES).toHaveLength(3);
    expect(VARIANTS).toHaveLength(9);
  });

  it('id 가 겹치지 않는다 — 겹치면 배정이 한쪽으로 쏠린다', () => {
    expect(new Set(VARIANTS.map((v) => v.id)).size).toBe(9);
  });

  it('id 가 layout:face 와 어긋나지 않는다', () => {
    for (const v of VARIANTS) expect(v.id).toBe(`${v.layout}:${v.face}`);
  });

  it('모든 배치와 모든 앞면이 빠짐없이 쓰인다', () => {
    expect(new Set(VARIANTS.map((v) => v.layout))).toEqual(new Set(LAYOUTS));
    expect(new Set(VARIANTS.map((v) => v.face))).toEqual(new Set(FACES));
  });
});

describe('parseVariant — 주소에서 오는 값이라 믿지 않는다', () => {
  it('아는 id 는 그대로 준다', () => {
    expect(parseVariant('rail:sigil')).toMatchObject({ layout: 'rail', face: 'sigil' });
  });

  it('앞뒤 공백은 흘린다', () => {
    expect(parseVariant('  grid:plain ')?.id).toBe('grid:plain');
  });

  it('모르는 값·빈 값은 null — 기본으로 물러설 수 있게', () => {
    expect(parseVariant('fan:fancy')).toBeNull();
    expect(parseVariant('rail')).toBeNull();
    expect(parseVariant('')).toBeNull();
    expect(parseVariant(null)).toBeNull();
    expect(parseVariant(undefined)).toBeNull();
  });

  it('아홉 개 전부 되돌아온다 — 주소로 어느 조합이든 박을 수 있다', () => {
    for (const v of VARIANTS) expect(parseVariant(v.id)).toEqual(v);
  });
});

describe('기본값', () => {
  it('지금까지의 동작이 기본이다 — 아무것도 못 읽어도 화면이 그대로다', () => {
    expect(DEFAULT_VARIANT.id).toBe('fan:plain');
    expect(VARIANTS).toContainEqual(DEFAULT_VARIANT);
  });
});

describe('variantLabel', () => {
  it('아홉 개의 이름이 저마다 다르다 — 투표 결과를 읽을 때 구분돼야 한다', () => {
    expect(new Set(VARIANTS.map(variantLabel)).size).toBe(9);
  });

  it('사람이 읽는 말이다', () => {
    expect(variantLabel({ id: 'rail:sigil', layout: 'rail', face: 'sigil' })).toBe('띠 + 문양');
  });
});
