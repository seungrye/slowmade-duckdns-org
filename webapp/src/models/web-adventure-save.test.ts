// WebAdventureSave 모델 단위 테스트 (#237).
//
// 5주차 milestone — 플레이어의 진행도 mongo 저장.
// 한 사용자(userEmail) 당 1 save (현재 진행 중인 회차). 엔딩 도달 시 past run
// 으로 이전 후 save 초기화 (회차 시스템은 #239 에서).

import { describe, it, expect } from 'vitest';
import WebAdventureSave from './web-adventure-save';

function makeDoc(overrides: Record<string, unknown> = {}) {
  return new WebAdventureSave({
    userEmail: 'tester@example.com',
    runIndex: 1,
    character: {
      stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
      hp: 10,
      maxHp: 10,
      ability: 'scholar',
      inventory: [],
      flags: {},
      rerollsLeft: 3,
    },
    currentSceneId: 'town_square_dawn',
    ...overrides,
  });
}

describe('WebAdventureSave 필수 필드', () => {
  it('userEmail 이 없으면 검증 실패', () => {
    const doc = makeDoc({ userEmail: undefined });
    const err = doc.validateSync();
    expect(err?.errors?.userEmail).toBeDefined();
  });

  it('runIndex 가 없으면 검증 실패', () => {
    const doc = makeDoc({ runIndex: undefined });
    const err = doc.validateSync();
    expect(err?.errors?.runIndex).toBeDefined();
  });

  it('runIndex 가 1 미만이면 검증 실패', () => {
    const doc = makeDoc({ runIndex: 0 });
    const err = doc.validateSync();
    expect(err?.errors?.runIndex).toBeDefined();
  });

  it('currentSceneId 가 없으면 검증 실패', () => {
    const doc = makeDoc({ currentSceneId: undefined });
    const err = doc.validateSync();
    expect(err?.errors?.currentSceneId).toBeDefined();
  });

  it('character.ability 가 없으면 검증 실패', () => {
    const doc = makeDoc({
      character: {
        stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
        hp: 10,
        maxHp: 10,
        ability: undefined,
        inventory: [],
        flags: {},
        rerollsLeft: 3,
      },
    });
    const err = doc.validateSync();
    expect(err?.errors).toBeDefined();
    expect(Object.keys(err?.errors ?? {}).some((k) => k.includes('ability'))).toBe(true);
  });

  it('character.stats 의 6 스탯 모두 number 이어야', () => {
    const doc = makeDoc({
      character: {
        stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5 /* wis 누락 */ },
        hp: 10,
        maxHp: 10,
        ability: 'scholar',
        inventory: [],
        flags: {},
        rerollsLeft: 3,
      },
    });
    const err = doc.validateSync();
    expect(err?.errors).toBeDefined();
  });
});

describe('WebAdventureSave 정상 케이스', () => {
  it('필수 필드 모두 채우면 검증 통과', () => {
    const doc = makeDoc();
    expect(doc.validateSync()).toBeUndefined();
  });

  it('inventory 는 string 배열 (아이템 id)', () => {
    const doc = makeDoc({
      character: {
        stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
        hp: 10,
        maxHp: 10,
        ability: 'scholar',
        inventory: ['bread', 'torch'],
        flags: {},
        rerollsLeft: 3,
      },
    });
    expect(doc.validateSync()).toBeUndefined();
    expect((doc.toObject() as { character: { inventory: string[] } }).character.inventory).toEqual([
      'bread',
      'torch',
    ]);
  });

  it('flags 는 임의 key/boolean (Map) 보존', () => {
    const doc = makeDoc({
      character: {
        stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
        hp: 10,
        maxHp: 10,
        ability: 'scholar',
        inventory: [],
        flags: { caughtBefore: true, visited_market: true },
        rerollsLeft: 3,
      },
    });
    expect(doc.validateSync()).toBeUndefined();
  });
});
