// #79 — 씬 CMS 의 본문 탭 [트리트먼트 | 기본 | 톨킨 풍 | +].
//
// 탭 전환·읽기·쓰기를 순수 함수로 떼어 테스트한다. UI 는 이 함수들을 부르기만 한다.
import { describe, it, expect } from 'vitest';
import type { TabbedScene } from './scene-body-tabs';
import {
  TREATMENT_TAB,
  BODY_TAB,
  bodyTabs,
  readTab,
  writeTab,
  tabLabel,
} from './scene-body-tabs';

const scene = () => ({
  body: ['기본 첫 줄', '기본 둘째 줄'],
  treatment: ['사건 뼈대'],
  variants: { tolkien: ['옛적에'] },
});

describe('bodyTabs', () => {
  it('트리트먼트·기본이 앞에 오고 문체가 이름순으로 뒤따른다', () => {
    expect(bodyTabs(scene())).toEqual([TREATMENT_TAB, BODY_TAB, 'tolkien']);
  });

  it('변형이 없으면 트리트먼트와 기본만', () => {
    expect(bodyTabs({ body: ['x'] })).toEqual([TREATMENT_TAB, BODY_TAB]);
  });

  it('빈 배열인 변형도 탭으로 보여 준다 — 작성 중인 문체를 숨기면 안 된다', () => {
    expect(bodyTabs({ body: ['x'], variants: { prose: [] } })).toEqual([
      TREATMENT_TAB, BODY_TAB, 'prose',
    ]);
  });
});

describe('readTab', () => {
  it('탭별로 해당 배열을 읽는다', () => {
    const s = scene();
    expect(readTab(s, TREATMENT_TAB)).toEqual(['사건 뼈대']);
    expect(readTab(s, BODY_TAB)).toEqual(['기본 첫 줄', '기본 둘째 줄']);
    expect(readTab(s, 'tolkien')).toEqual(['옛적에']);
  });

  it('없는 탭은 빈 배열', () => {
    expect(readTab(scene(), 'nope')).toEqual([]);
    expect(readTab({ body: ['x'] }, TREATMENT_TAB)).toEqual([]);
  });
});

describe('writeTab', () => {
  it('기본 탭은 body 를 고친다', () => {
    const out = writeTab(scene(), BODY_TAB, ['새 본문']);
    expect(out.body).toEqual(['새 본문']);
    expect(out.variants).toEqual({ tolkien: ['옛적에'] });
  });

  it('트리트먼트 탭은 treatment 를 고친다', () => {
    const out = writeTab(scene(), TREATMENT_TAB, ['새 뼈대']);
    expect(out.treatment).toEqual(['새 뼈대']);
    expect(out.body).toEqual(['기본 첫 줄', '기본 둘째 줄']);
  });

  it('문체 탭은 그 variants 만 고친다', () => {
    const out = writeTab({ ...scene(), variants: { tolkien: ['옛적에'], prose: ['산문'] } },
      'tolkien', ['고쳐 씀']);
    expect(out.variants).toEqual({ tolkien: ['고쳐 씀'], prose: ['산문'] });
  });

  it('없던 문체도 새로 만들 수 있다', () => {
    const out = writeTab<TabbedScene>({ body: ['x'] }, 'hemingway', ['짧게.']);
    expect(out.variants).toEqual({ hemingway: ['짧게.'] });
  });

  // 원본을 건드리면 폼 상태 관리가 꼬인다.
  it('입력 객체를 변형하지 않는다', () => {
    const s = scene();
    writeTab(s, 'tolkien', ['바뀜']);
    expect(s.variants).toEqual({ tolkien: ['옛적에'] });
  });
});

describe('tabLabel', () => {
  it('내부 키를 사람이 읽는 이름으로 바꾼다', () => {
    expect(tabLabel(TREATMENT_TAB)).toBe('트리트먼트');
    expect(tabLabel(BODY_TAB)).toBe('기본');
    expect(tabLabel('tolkien')).toBe('톨킨 풍');
  });

  it('모르는 문체는 키를 그대로 보여 준다', () => {
    expect(tabLabel('hemingway')).toBe('hemingway');
  });
});
