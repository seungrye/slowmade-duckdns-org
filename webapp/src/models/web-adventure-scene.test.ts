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
    const doc = makeDoc({ choices: [], isEnding: true, endingId: 'main' });
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

describe('onEnter / endingId', () => {
  it('onEnter.addItems 배열을 받는다', () => {
    const doc = makeDoc({ onEnter: { addItems: ['spellbook'] } });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('endingId 가 enum 밖이면 실패', () => {
    const doc = makeDoc({ isEnding: true, endingId: 'invalid_ending', choices: [] });
    const err = doc.validateSync();
    expect(err).toBeDefined();
  });

  it('endingId = main 은 통과', () => {
    const doc = makeDoc({ isEnding: true, endingId: 'main', choices: [] });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });
});
