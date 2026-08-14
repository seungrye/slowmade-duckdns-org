// 엔딩마다 씬 삽화를 한 장 더 만든다 (#158) — 프롬프트 만들기와 씬 추첨.
import { describe, it, expect } from 'vitest';
import { ETERNIA_ART_STYLE, buildScenePrompt, pickSceneForImage } from './scene-image-prompt';

const SCENE = {
  id: 'kael_infirmary',
  title: '의무실',
  body: [
    '차가운 금속 침대. 사방을 채운 시큼한 에테르 정제수 냄새에 눈이 떠진다.',
    '피부를 뚫고 돋아난 푸른 마력 결정이 가스등 불빛을 받아 기괴하게 반짝인다.',
    '벤딕트 박사가 차트를 넘긴다.',
  ],
};

describe('buildScenePrompt', () => {
  it('씬 제목과 본문을 재료로 쓴다', () => {
    const p = buildScenePrompt(SCENE);
    expect(p).toContain('의무실');
    expect(p).toContain('에테르');
  });

  // 기존 삽화 3장과 톤이 어긋나면 오히려 품질이 떨어진다. 화풍은 늘 붙는다.
  it('화풍 문구가 항상 붙는다', () => {
    expect(buildScenePrompt(SCENE)).toContain(ETERNIA_ART_STYLE);
    expect(buildScenePrompt({ id: 'x', title: '', body: [] })).toContain(ETERNIA_ART_STYLE);
  });

  it('화풍은 인물 없는 배경화를 못 박는다 — 기존 삽화가 전부 그렇다', () => {
    expect(ETERNIA_ART_STYLE).toMatch(/no people|no characters/i);
  });

  // 화풍에 장소를 넣으면 숲 씬에까지 실내를 강제한다. 장소는 본문이 정한다.
  it('화풍은 장소를 정하지 않는다', () => {
    expect(ETERNIA_ART_STYLE).not.toMatch(/interior|indoor|room|corridor|pipes/i);
  });

  it('제목의 편집용 번호를 뗀다 — 모델이 글자를 그리려 든다', () => {
    const p = buildScenePrompt({ id: 'x', title: 'Scene 02a-ii — 영수의 부름', body: ['숲'] });
    expect(p).toContain('영수의 부름');
    expect(p).not.toContain('02a-ii');
    expect(p).not.toMatch(/\bScene\b/);
  });

  it('본문이 길어도 프롬프트를 잘라 낸다 — 이미지 프롬프트는 길수록 흐려진다', () => {
    const long = { id: 'x', title: '긴 씬', body: Array.from({ length: 50 }, () => '가'.repeat(200)) };
    const p = buildScenePrompt(long);
    expect(p.length).toBeLessThan(1200);
    expect(p).toContain(ETERNIA_ART_STYLE);
  });

  it('본문이 비어도 제목만으로 만든다', () => {
    const p = buildScenePrompt({ id: 'x', title: '무너진 다리', body: [] });
    expect(p).toContain('무너진 다리');
  });

  // 본문에는 *강조* 같은 서식과 지시문이 섞여 있다. 그림 프롬프트에 그대로 흘리지 않는다.
  it('강조 표시와 줄바꿈을 정리한다', () => {
    const p = buildScenePrompt({ id: 'x', title: 'T', body: ['*링크 하사* 가 온다.\n뒤를 돌아본다.'] });
    expect(p).not.toContain('*');
    expect(p).not.toContain('\n');
  });
});

describe('pickSceneForImage', () => {
  const scenes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('무작위로 하나 고른다 — 난수는 주입받는다', () => {
    expect(pickSceneForImage(scenes, { rand: () => 0 })?.id).toBe('a');
    expect(pickSceneForImage(scenes, { rand: () => 0.99 })?.id).toBe('c');
    expect(pickSceneForImage(scenes, { rand: () => 0.5 })?.id).toBe('b');
  });

  // 한 씬만 계속 뽑혀 그림이 수십 장 쌓이는 걸 막는다.
  it('이미 충분히 쌓인 씬은 건너뛴다', () => {
    const many = [{ id: 'a', illustrations: Array(99).fill('u') }, { id: 'b' }];
    expect(pickSceneForImage(many, { rand: () => 0, maxPerScene: 8 })?.id).toBe('b');
  });

  it('모두 가득 찼으면 아무것도 고르지 않는다', () => {
    const full = [{ id: 'a', illustrations: Array(9).fill('u') }];
    expect(pickSceneForImage(full, { rand: () => 0, maxPerScene: 8 })).toBeNull();
  });

  it('빈 목록도 안전하다', () => {
    expect(pickSceneForImage([], { rand: () => 0 })).toBeNull();
  });
});
