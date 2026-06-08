// WebAdventureSceneRevision 모델 단위 테스트.
// PUT 마다 *이전 상태* 의 snapshot 을 저장 → 복원 가능.
//
// 옛 post revision 패턴과 동일:
//   - sceneId 별 version 증가 (1, 2, 3, ...)
//   - 다른 sceneId 는 독립 sequence.
//   - snapshot 은 Schema.Types.Mixed (씬 전체 자유 구조).

import { describe, it, expect } from 'vitest';
import WebAdventureSceneRevision from './web-adventure-scene-revision';

function makeDoc(overrides: Partial<Record<string, unknown>> = {}) {
  return new WebAdventureSceneRevision({
    sceneId: 'kael_infirmary',
    snapshot: { id: 'kael_infirmary', title: '구 진료소', body: ['옛 본문'], choices: [] },
    version: 1,
    author: 'system',
    createdAt: new Date(),
    ...overrides,
  });
}

describe('WebAdventureSceneRevision 필수 필드', () => {
  it('sceneId 가 없으면 검증 실패', () => {
    const doc = makeDoc({ sceneId: undefined });
    const err = doc.validateSync();
    expect(err?.errors?.sceneId).toBeDefined();
  });

  it('snapshot 이 없으면 검증 실패', () => {
    const doc = makeDoc({ snapshot: undefined });
    const err = doc.validateSync();
    expect(err?.errors?.snapshot).toBeDefined();
  });

  it('version 이 없으면 검증 실패', () => {
    const doc = makeDoc({ version: undefined });
    const err = doc.validateSync();
    expect(err?.errors?.version).toBeDefined();
  });

  it('정상 필드 셋이면 검증 통과', () => {
    const doc = makeDoc();
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });

  it('author 기본값은 system', () => {
    const doc = makeDoc({ author: undefined });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
    expect((doc as unknown as { author: string }).author).toBe('system');
  });

  it('snapshot 은 자유 구조 — 임의 키 허용 (strict 미적용)', () => {
    const doc = makeDoc({
      snapshot: {
        id: 'free_form',
        title: '임의 씬',
        body: ['a'],
        choices: [],
        onEnter: { setFlags: { x: true } },
        illustration: '/x.jpg',
        someUnknownKey: 'ok',
      },
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
  });
});
