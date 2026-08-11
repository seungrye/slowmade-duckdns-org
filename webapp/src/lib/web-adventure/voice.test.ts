// 문체(voice) 변형 — 사건은 treatment 가 정본, 표현만 문체별로 갈린다. (#73)
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VOICE,
  resolveBody,
  voiceCoverage,
  listVoices,
  pickVoice,
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
