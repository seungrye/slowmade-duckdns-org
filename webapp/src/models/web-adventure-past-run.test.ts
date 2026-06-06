// WebAdventurePastRun 모델 (#239).
//
// 엔딩 도달 시 현재 save 를 옮겨 적치. 갤러리/통계용.

import { describe, it, expect } from 'vitest';
import WebAdventurePastRun from './web-adventure-past-run';

function makeDoc(overrides: Record<string, unknown> = {}) {
  return new WebAdventurePastRun({
    userEmail: 'tester@example.com',
    runIndex: 1,
    endingId: 'ascension',
    finalSceneId: 'elder_house_ending',
    character: {
      stats: { str: 5, dex: 10, int: 5, cha: 5, con: 5, wis: 5 },
      hp: 8,
      maxHp: 10,
      ability: 'scholar',
      protagonist: 'kael',
      stigmaErosion: 70,
      inventory: ['super_tintham_cracker'],
      flags: {},
      rerollsLeft: 1,
    },
    completedAt: new Date(),
    ...overrides,
  });
}

describe('WebAdventurePastRun 필수 필드', () => {
  it('userEmail 누락 → 실패', () => {
    expect(makeDoc({ userEmail: undefined }).validateSync()?.errors?.userEmail).toBeDefined();
  });
  it('runIndex 누락 → 실패', () => {
    expect(makeDoc({ runIndex: undefined }).validateSync()?.errors?.runIndex).toBeDefined();
  });
  it('endingId 가 enum 에 없으면 실패', () => {
    expect(makeDoc({ endingId: 'unknown' }).validateSync()?.errors?.endingId).toBeDefined();
  });
  it('finalSceneId 누락 → 실패', () => {
    expect(makeDoc({ finalSceneId: undefined }).validateSync()?.errors?.finalSceneId).toBeDefined();
  });
  it('character 누락 → 실패', () => {
    expect(makeDoc({ character: undefined }).validateSync()?.errors?.character).toBeDefined();
  });
  it('필수 필드 모두 채우면 통과', () => {
    expect(makeDoc().validateSync()).toBeUndefined();
  });
  it('endingId 6 종 (main/spirit/fail/shopkeeper/goblin_friend/wizard_apprentice) 모두 허용', () => {
    for (const id of ['ascension', 'revolution', 'fall', 'harmony', 'sylvan_bond', 'petrification']) {
      expect(makeDoc({ endingId: id }).validateSync()).toBeUndefined();
    }
  });

  // #287 — protagonist + stigmaErosion 보존 (snapshot 의미 보장).
  it('character.protagonist + stigmaErosion 보존', () => {
    const doc = makeDoc();
    expect(doc.validateSync()).toBeUndefined();
    const obj = doc.toObject() as { character: { protagonist: string; stigmaErosion: number } };
    expect(obj.character.protagonist).toBe('kael');
    expect(obj.character.stigmaErosion).toBe(70);
  });
});
