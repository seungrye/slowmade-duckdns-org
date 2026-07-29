// WebAdventureScene 모델 단위 테스트 (Mongoose 스키마 검증).
//
// 실제 DB 연결 없이 schema-level validation 만 검증한다.
// (mongoose validate() 메서드는 DB 없이도 동작.)

import { describe, it, expect } from 'vitest';
import WebAdventureScene from './web-adventure-scene';

function makeDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return new WebAdventureScene({
    id: 'test_scene',
    title: '테스트 씬',
    illustration: '/web-adventure/scenes/test.jpg',
    body: ['본문 한 줄'],
    choices: [{ kind: 'plain', id: 'go', label: '가다', to: 'next_scene' }],
    ...overrides,
  });
}

describe('WebAdventureScene 필수 필드', () => {
  it('id 가 없으면 검증 실패', () => {
    const doc = makeDoc({ id: undefined });
    const err = doc.validateSync();
    expect(err?.errors?.id).toBeDefined();
  });

  it('title 이 없으면 검증 실패', () => {
    const doc = makeDoc({ title: undefined });
    const err = doc.validateSync();
    expect(err?.errors?.title).toBeDefined();
  });

  it('illustration 이 없으면 검증 실패', () => {
    const doc = makeDoc({ illustration: undefined });
    const err = doc.validateSync();
    expect(err?.errors?.illustration).toBeDefined();
  });

  it('body 가 없으면 검증 실패', () => {
    const doc = makeDoc({ body: undefined });
    const err = doc.validateSync();
    expect(err?.errors?.body).toBeDefined();
  });

  it('choices 는 빈 배열이어도 OK (엔딩 씬)', () => {
    const doc = makeDoc({ choices: [], isEnding: true, endingId: 'ascension' });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('정상 필드 셋이면 검증 통과', () => {
    const doc = makeDoc();
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });
});

describe('Choice kind 별 필드 검증', () => {
  it('plain 선택지에 to 가 없으면 실패', () => {
    const doc = makeDoc({
      choices: [{ kind: 'plain', id: 'c1', label: '라벨' }],
    });
    const err = doc.validateSync();
    // schema-level 또는 custom validator 모두 가능 — choices 경로 어딘가에 에러
    expect(err).toBeDefined();
  });

  it('probability 선택지에 onSuccess / onFailure 가 모두 있으면 통과', () => {
    const doc = makeDoc({
      choices: [{
        kind: 'probability', id: 'c1', label: '확률 판정',
        stat: 'dex', difficulty: 12, onSuccess: 'win', onFailure: 'lose',
      }],
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('probability 선택지에 onSuccess 가 없으면 실패', () => {
    const doc = makeDoc({
      choices: [{
        kind: 'probability', id: 'c1', label: '확률 판정',
        stat: 'dex', difficulty: 12, onFailure: 'lose',
      }],
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  it('conditional 선택지에 condition 이 없으면 실패', () => {
    const doc = makeDoc({
      choices: [{ kind: 'conditional', id: 'c1', label: '조건', to: 'next' }],
    });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  it('conditional 선택지가 정상이면 통과', () => {
    const doc = makeDoc({
      choices: [{
        kind: 'conditional', id: 'c1', label: '조건',
        condition: { kind: 'hasItem', itemId: 'torch' }, to: 'next',
      }],
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });
});

describe('revisionCount 필드 (옛 quest CMS version 패턴)', () => {
  it('revisionCount 미정의 시 default 0', () => {
    const doc = makeDoc();
    // 미명시 시 기본값 0.
    expect((doc as unknown as { revisionCount: number }).revisionCount).toBe(0);
  });

  it('revisionCount 명시 값 그대로 유지', () => {
    const doc = makeDoc({ revisionCount: 5 });
    expect((doc as unknown as { revisionCount: number }).revisionCount).toBe(5);
  });
});

describe('onEnter / endingId', () => {
  it('onEnter.addItems 배열을 받는다', () => {
    const doc = makeDoc({ onEnter: { addItems: ['spellbook'] } });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('onEnter.setVars({{키}} 치환 소스)를 받아 보존한다', () => {
    const doc = makeDoc({ onEnter: { setVars: { route: '정문 초소', n: 3 } } });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
    const vars = (doc as unknown as { onEnter: { setVars: Map<string, unknown> } }).onEnter.setVars;
    expect(vars.get('route')).toBe('정문 초소');
    expect(vars.get('n')).toBe(3);
  });

  it('endingId 가 enum 밖이면 실패', () => {
    const doc = makeDoc({ isEnding: true, endingId: 'invalid_ending', choices: [] });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  it('endingId = main 은 통과', () => {
    const doc = makeDoc({ isEnding: true, endingId: 'ascension', choices: [] });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });
});

describe('bgm (씬 기본 배경음)', () => {
  it('bgm.src 있으면 통과 + loop/volume 보존', () => {
    const doc = makeDoc({ bgm: { src: '/a/theme.mp3', loop: true, volume: 0.5 } });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
    const bgm = (doc as unknown as { bgm: { src: string; loop: boolean; volume: number } }).bgm;
    expect(bgm.src).toBe('/a/theme.mp3');
    expect(bgm.loop).toBe(true);
    expect(bgm.volume).toBe(0.5);
  });

  it('bgm 을 지정하지 않으면 통과(선택 필드)', () => {
    const doc = makeDoc();
    expect(doc.validateSync()).toBeUndefined();
  });

  it('bgm 이 있으나 src 가 없으면 실패', () => {
    const doc = makeDoc({ bgm: { loop: true } });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });
});
