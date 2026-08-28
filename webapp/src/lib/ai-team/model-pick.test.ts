// 모델을 순위표에서 고른다 (#301).
//
// 모델 이름을 못박아 두면 그것이 은퇴하는 날 밤에 조용히 죽는다 — `stealth/ox-alpha` 때
// 실제로 그랬다(#283). 무료 목록은 자주 갈리므로(최근 20→15→14→18) 실행 시점에 살아
// 있는 것 중 제일 위를 고른다.
import { describe, it, expect } from 'vitest';
import {
  CODER_PREFERENCE, MANAGER_PREFERENCE, toolCapableIds, pickModel, pickModels,
} from '../../../../scripts/ai-team/model-pick.mjs';

/** `/api/v1/models` 응답 중 우리가 보는 것만. */
const 응답 = (...models: Array<[string, string[]]>) => ({
  data: models.map(([id, sp]) => ({ id, supported_parameters: sp })),
});

describe('toolCapableIds — 도구 호출이 되는 것만', () => {
  it('tools 를 지원하는 것만 남긴다', () => {
    const j = 응답(['a:free', ['tools', 'temperature']], ['b:free', ['temperature']]);
    expect(toolCapableIds(j)).toEqual(['a:free']);
  });

  it('순서를 보존한다', () => {
    const j = 응답(['a', ['tools']], ['b', ['tools']]);
    expect(toolCapableIds(j)).toEqual(['a', 'b']);
  });

  // 조회가 깨졌다고 러너가 터지면 안 된다. 빈 목록이면 호출측이 1순위로 떨어진다.
  it('응답이 깨져도 터지지 않고 빈 목록을 준다', () => {
    for (const bad of [null, undefined, {}, { data: null }, { data: 'x' }, { data: [{}] }]) {
      expect(toolCapableIds(bad as never)).toEqual([]);
    }
  });

  it('supported_parameters 가 없으면 뺀다 — 모르는 것을 된다고 치지 않는다', () => {
    expect(toolCapableIds({ data: [{ id: 'a' }] } as never)).toEqual([]);
  });
});

describe('pickModel — 살아 있는 첫 번째', () => {
  it('1순위가 살아 있으면 그것을 고르고 순위는 0 이다', () => {
    expect(pickModel({ preferred: ['a', 'b'], available: ['a', 'b'] }))
      .toEqual({ id: 'a', index: 0 });
  });

  // 이게 이 모듈을 만든 이유다 — 1순위가 은퇴한 밤.
  it('1순위가 죽었으면 다음으로 넘어간다', () => {
    expect(pickModel({ preferred: ['a', 'b'], available: ['b'] }))
      .toEqual({ id: 'b', index: 1 });
  });

  it('여러 개가 죽어도 계속 내려간다', () => {
    expect(pickModel({ preferred: ['a', 'b', 'c'], available: ['c'] }))
      .toEqual({ id: 'c', index: 2 });
  });

  it('하나도 안 살아 있으면 null — 호출측이 1순위로 떨어진다', () => {
    expect(pickModel({ preferred: ['a', 'b'], available: ['x'] })).toBeNull();
    expect(pickModel({ preferred: ['a'], available: [] })).toBeNull();
  });

  it('순위표가 비면 null', () => {
    expect(pickModel({ preferred: [], available: ['a'] })).toBeNull();
  });

  it('인자가 없어도 터지지 않는다', () => {
    expect(pickModel()).toBeNull();
    expect(pickModel({} as never)).toBeNull();
  });

  it('살아 있는 목록의 순서는 상관없다 — 순위표가 정한다', () => {
    expect(pickModel({ preferred: ['a', 'b'], available: ['b', 'a'] })?.id).toBe('a');
  });
});

describe('순위표 — 실측한 것을 위에 둔다 (#307)', () => {
  // 실제로 돌려 통과한 것들. 나머지는 공유 풀 소진으로 못 쟀거나 풀에 묶여 있다.
  const 측정통과 = [
    'minimax/minimax-m3:free',
    'minimax/minimax-m2.7:free',
    'thinkingmachines/inkling:free',
  ];

  it('코더 1순위는 실측 통과한 것이다', () => {
    expect(측정통과).toContain(CODER_PREFERENCE[0]);
  });

  it('관리 1순위는 실측 통과한 것이다', () => {
    expect(측정통과).toContain(MANAGER_PREFERENCE[0]);
  });

  // 공유 풀(하루 50회)에 묶인 것을 위에 두면 금방 막힌다. 마지막 수단으로만 둔다.
  it('실측 통과한 셋이 두 순위표 모두 앞쪽에 있다', () => {
    for (const 표 of [CODER_PREFERENCE, MANAGER_PREFERENCE]) {
      expect(표.slice(0, 3).every((m) => 측정통과.includes(m))).toBe(true);
    }
  });
});

describe('순위표 — 오픈 웨이트만 담는다', () => {
  // :free 변형은 전부 제공자가 1개(후원자)라 신호가 안 된다. 기반 모델을 여럿이
  // 호스팅하는 것만 담는다 — 무료판이 사라져도 갈아탈 곳이 있다.
  const 제외 = ['poolside/', 'cohere/north-mini-code', 'dots-studio/', 'inclusionai/', 'liquid/'];

  for (const [이름, 표] of [['코더', CODER_PREFERENCE], ['관리', MANAGER_PREFERENCE]] as const) {
    it(`${이름} 순위표는 비어 있지 않다`, () => {
      expect(표.length).toBeGreaterThan(0);
    });

    it(`${이름} 순위표는 전부 :free 다`, () => {
      for (const m of 표) expect(m.endsWith(':free')).toBe(true);
    });

    it(`${이름} 순위표에 중복이 없다`, () => {
      expect(new Set(표).size).toBe(표.length);
    });

    it(`${이름} 순위표에 단일 제공자 모델이 없다`, () => {
      for (const m of 표) {
        for (const bad of 제외) expect(m.startsWith(bad)).toBe(false);
      }
    });
  }
});

// 개발자를 둘로 두려면 **서로 다른** 모델이 필요하다 (#307). 하나만 뽑으면 둘 다 1순위가 된다.
describe('pickModels — 살아 있는 것 여럿', () => {
  it('위에서부터 요청한 수만큼', () => {
    expect(pickModels({ preferred: ['a', 'b', 'c'], available: ['a', 'b', 'c'], count: 2 }))
      .toEqual([{ id: 'a', index: 0 }, { id: 'b', index: 1 }]);
  });

  it('죽은 것은 건너뛴다', () => {
    expect(pickModels({ preferred: ['a', 'b', 'c'], available: ['c', 'a'], count: 2 }))
      .toEqual([{ id: 'a', index: 0 }, { id: 'c', index: 2 }]);
  });

  it('살아 있는 것이 모자라면 있는 만큼만 — 하나뿐이면 개발자도 하나', () => {
    expect(pickModels({ preferred: ['a', 'b'], available: ['b'], count: 2 }))
      .toEqual([{ id: 'b', index: 1 }]);
  });

  it('하나도 없으면 빈 목록', () => {
    expect(pickModels({ preferred: ['a'], available: ['x'], count: 2 })).toEqual([]);
  });

  it('순위표에 중복이 있어도 같은 모델을 두 번 담지 않는다', () => {
    expect(pickModels({ preferred: ['a', 'a', 'b'], available: ['a', 'b'], count: 2 }))
      .toEqual([{ id: 'a', index: 0 }, { id: 'b', index: 2 }]);
  });

  it('수가 0 이하거나 숫자가 아니면 빈 목록', () => {
    for (const c of [0, -1, NaN, undefined, 'x']) {
      expect(pickModels({ preferred: ['a'], available: ['a'], count: c as never })).toEqual([]);
    }
  });

  it('인자가 없어도 터지지 않는다', () => {
    expect(pickModels()).toEqual([]);
  });
});
