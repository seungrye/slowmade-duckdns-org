// 문체(voice) 변형 — 사건은 treatment 가 정본, 표현만 문체별로 갈린다. (#73)
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VOICE,
  RUN_VOICE_KEY,
  resolveBody,
  voiceCoverage,
  listVoices,
  pickVoice,
  pickVoiceFromCoverage,
  chooseRunVoice,
} from './voice';

const scene = (id: string, body: string[], variants?: Record<string, string[]>) => ({
  id,
  body,
  ...(variants ? { variants } : {}),
});

describe('resolveBody', () => {
  it('요청한 문체가 있으면 그것을 쓴다', () => {
    const s = scene('a', ['기본'], { tolkien: ['옛적에'] });
    expect(resolveBody(s, 'tolkien')).toEqual(['옛적에']);
  });

  // 폴백은 기본 body 로 간다 — treatment(뼈대)가 화면에 나가면 안 된다.
  it('변형이 없으면 기본 body 로 폴백', () => {
    const s = scene('a', ['기본'], { prose: ['산문'] });
    expect(resolveBody(s, 'tolkien')).toEqual(['기본']);
  });

  it('빈 배열 변형도 없는 것으로 취급', () => {
    const s = scene('a', ['기본'], { tolkien: [] });
    expect(resolveBody(s, 'tolkien')).toEqual(['기본']);
  });

  it('기본 문체를 요청하면 항상 body', () => {
    const s = scene('a', ['기본'], { tolkien: ['옛적에'] });
    expect(resolveBody(s, DEFAULT_VOICE)).toEqual(['기본']);
  });

  it('voice 를 안 주면 기본 body', () => {
    expect(resolveBody(scene('a', ['기본']))).toEqual(['기본']);
  });

  it('treatment 는 어떤 경우에도 노출하지 않는다', () => {
    const s = { ...scene('a', ['기본']), treatment: ['뼈대만'] };
    expect(resolveBody(s, 'tolkien')).toEqual(['기본']);
    expect(resolveBody(s, DEFAULT_VOICE)).toEqual(['기본']);
  });
});

describe('voiceCoverage', () => {
  const scenes = [
    scene('a', ['기'], { tolkien: ['t'], prose: ['p'] }),
    scene('b', ['기'], { tolkien: ['t'] }),
    scene('c', ['기'], {}),
  ];

  it('문체별로 채운 씬 수와 비율을 센다', () => {
    const cov = voiceCoverage(scenes);
    expect(cov.tolkien).toEqual({ filled: 2, total: 3, complete: false });
    expect(cov.prose).toEqual({ filled: 1, total: 3, complete: false });
  });

  it('전부 채우면 complete', () => {
    const cov = voiceCoverage([scene('a', ['기'], { tolkien: ['t'] })]);
    expect(cov.tolkien.complete).toBe(true);
  });

  it('변형이 하나도 없으면 빈 결과', () => {
    expect(voiceCoverage([scene('a', ['기'])])).toEqual({});
  });
});

describe('listVoices', () => {
  it('기본 문체를 항상 맨 앞에 두고, 나머지를 이름순으로', () => {
    const scenes = [scene('a', ['기'], { tolkien: ['t'] }), scene('b', ['기'], { prose: ['p'] })];
    expect(listVoices(scenes)).toEqual([DEFAULT_VOICE, 'prose', 'tolkien']);
  });

  it('변형이 없으면 기본 문체만', () => {
    expect(listVoices([scene('a', ['기'])])).toEqual([DEFAULT_VOICE]);
  });
});

describe('pickVoiceFromCoverage', () => {
  // 클라이언트는 variants 가 제거된 씬을 받으므로 scenes 로는 완비 여부를 알 수 없다.
  // API 가 주는 coverage 로 골라야 한다 (#79).
  const cov = {
    tolkien: { filled: 3, total: 3, complete: true },
    prose: { filled: 2, total: 3, complete: false },
  };

  it('완비된 문체와 기본 문체 중에서 고른다', () => {
    expect(pickVoiceFromCoverage(cov, () => 0.99)).toBe('tolkien');
    expect(pickVoiceFromCoverage(cov, () => 0)).toBe(DEFAULT_VOICE);
  });

  it('완비된 것이 없으면 기본 문체', () => {
    expect(pickVoiceFromCoverage({ prose: { filled: 1, total: 3, complete: false } }, () => 0.99))
      .toBe(DEFAULT_VOICE);
  });

  it('빈 coverage 여도 기본 문체', () => {
    expect(pickVoiceFromCoverage({}, () => 0.5)).toBe(DEFAULT_VOICE);
  });
});

describe('chooseRunVoice', () => {
  const cov = { tolkien: { filled: 3, total: 3, complete: true } };
  const mem = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      _map: m,
    };
  };

  it('URL 로 지정한 문체가 가장 우선한다', () => {
    const s = mem();
    expect(chooseRunVoice({ coverage: cov, override: 'tolkien', storage: s, rnd: () => 0 }))
      .toBe('tolkien');
  });

  // 한 판 안에서 문체가 갈리면 몰입이 깨진다 — 뽑은 값을 유지해야 한다.
  it('한 번 뽑은 문체는 그 판 내내 유지된다', () => {
    const s = mem();
    const first = chooseRunVoice({ coverage: cov, storage: s, rnd: () => 0.99 });
    expect(first).toBe('tolkien');
    // 다음 호출은 난수가 달라도 같은 값이어야 한다.
    expect(chooseRunVoice({ coverage: cov, storage: s, rnd: () => 0 })).toBe('tolkien');
  });

  it('저장된 문체가 더 이상 완비가 아니면 다시 뽑는다', () => {
    const s = mem();
    s.setItem(RUN_VOICE_KEY, 'prose');
    expect(chooseRunVoice({ coverage: cov, storage: s, rnd: () => 0.99 })).toBe('tolkien');
  });

  it('storage 가 없어도(SSR) 동작한다', () => {
    expect(chooseRunVoice({ coverage: cov, rnd: () => 0.99 })).toBe('tolkien');
  });

  it('기본 문체가 뽑히면 그것도 저장해 판 내내 유지한다', () => {
    const s = mem();
    expect(chooseRunVoice({ coverage: cov, storage: s, rnd: () => 0 })).toBe(DEFAULT_VOICE);
    expect(chooseRunVoice({ coverage: cov, storage: s, rnd: () => 0.99 })).toBe(DEFAULT_VOICE);
  });
});

describe('pickVoice', () => {
  const scenes = [
    scene('a', ['기'], { tolkien: ['t'], prose: ['p'] }),
    scene('b', ['기'], { tolkien: ['t'] }), // prose 미완비
  ];

  // 완비된 문체만 랜덤 후보 — 섞이면 몰입이 깨지므로.
  it('완비된 문체 중에서 고른다', () => {
    expect(pickVoice(scenes, () => 0.99)).toBe('tolkien');
    expect(pickVoice(scenes, () => 0)).toBe(DEFAULT_VOICE);
  });

  it('완비된 변형이 없으면 기본 문체', () => {
    const only = [scene('a', ['기'], { tolkien: ['t'] }), scene('b', ['기'])];
    expect(pickVoice(only, () => 0.99)).toBe(DEFAULT_VOICE);
  });

  it('빈 목록이어도 기본 문체', () => {
    expect(pickVoice([], () => 0.5)).toBe(DEFAULT_VOICE);
  });
});
