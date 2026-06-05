// #236 — 풀 플레이 자동 테스트 (6 엔딩 시퀀스 통합 e2e).
//
// milestone 6 주차: '풀 플레이 자동 테스트 — 6 엔딩 모두 시퀀스 자동화'.
// 기존 scenarios.test.ts 가 각 엔딩 path 를 개별 케이스로 다루는데, 이 파일은
//   - 6 엔딩 모두 한 자리에서 데이터 테이블(it.each) 로 정리
//   - 캐릭터 생성 → 선택 시퀀스 → 엔딩 도달까지 reducer 흐름 통합 검증
//   - 모든 endingId 가 sceneRegistry 에 존재하고 isEnding=true 인지 보강 검증
// 다른 작업(저장/회차/UI) 진행하다가 reducer/콘텐츠가 깨지면 즉시 감지.

import { describe, test, expect } from 'vitest';
import type {
  AbilityKey,
  Character,
  GameState,
  StatKey,
} from '@/types/web-adventure';
import { gameReducer } from '@/lib/web-adventure/engine/reducer';
import { scenes, START_SCENE_ID } from '@/lib/web-adventure/engine/sceneRegistry';

type RngMode = 'success' | 'failure' | 'neutral';
const rngForMode = (mode: RngMode): (() => number) =>
  mode === 'success' ? () => 0.99 : mode === 'failure' ? () => 0.0 : () => 0.5;

function makeCharacter(
  stats: Partial<Record<StatKey, number>>,
  ability: AbilityKey,
  inventory: string[] = [],
): Character {
  const base: Record<StatKey, number> = { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 };
  return {
    stats: { ...base, ...stats },
    hp: 10,
    maxHp: 10,
    ability,
    inventory,
    flags: {},
    rerollsLeft: 3,
  };
}

function startGame(character: Character): GameState {
  return gameReducer(
    { phase: 'creating' },
    { type: 'START_GAME', character, startScene: START_SCENE_ID },
    scenes,
  );
}

function makeChoice(state: GameState, choiceId: string, rng: () => number): GameState {
  return gameReducer(state, { type: 'MAKE_CHOICE', choiceId, rng }, scenes);
}

/**
 * 한 엔딩 시퀀스 데이터.
 * - choices: 순서대로 적용. 각 step 의 expected scene 이 있으면 *그 scene 도달 확인*.
 * - rngOverride 가 있으면 그 step 에만 다른 rng 사용 (대부분 행로의 마지막에 성공/실패 강제).
 */
interface EndingScenario {
  endingId: string;
  description: string;
  character: Character;
  defaultRng: RngMode;
  steps: Array<{
    choice: string;
    expectScene?: string;
    rngOverride?: RngMode;
    expectInventory?: string[];
  }>;
}

const SCENARIOS: EndingScenario[] = [
  {
    endingId: 'main',
    description: '광장 → 시장 잠입 성공 → 장로집 → 메인 엔딩',
    character: makeCharacter({ dex: 10 }, 'scholar'),
    defaultRng: 'success',
    steps: [
      { choice: 'to_market', expectScene: 'market_morning' },
      {
        choice: 'sneak_storage',
        expectScene: 'market_storage_success',
        expectInventory: ['super_tintham_cracker'],
      },
      { choice: 'to_elder', expectScene: 'elder_house_arrival' },
      { choice: 'give_snack' }, // → ending
    ],
  },
  {
    endingId: 'spirit',
    description: '시장 실패 → 광장 회귀 → 숲 → 산신령 wis 판정 ✓ → spirit 엔딩',
    character: makeCharacter({ dex: 5, wis: 10 }, 'scholar'),
    defaultRng: 'failure',
    steps: [
      { choice: 'to_market', expectScene: 'market_morning' },
      { choice: 'sneak_storage', expectScene: 'market_caught' },
      { choice: 'retreat', expectScene: 'town_square_dawn' },
      { choice: 'to_forest', expectScene: 'forest_entry' },
      { choice: 'meet_spirit', rngOverride: 'success' }, // → spirit ending
    ],
  },
  {
    endingId: 'fail',
    description: '시장 잠입 3 회 실패 → 뒷골목 추방 fail 엔딩',
    character: makeCharacter({ dex: 3 }, 'scholar'),
    defaultRng: 'failure',
    steps: [
      // 1차
      { choice: 'to_market' },
      { choice: 'sneak_storage', expectScene: 'market_caught' },
      { choice: 'retreat' },
      // 2차
      { choice: 'to_market' },
      { choice: 'sneak_storage' },
      { choice: 'retreat' },
      // 3차 — 뒷골목 → fail
      { choice: 'to_market' },
      { choice: 'sneak_storage', expectScene: 'market_caught' },
      { choice: 'to_back_alley', expectScene: 'market_back_alley' },
      { choice: 'to_fail' },
    ],
  },
  {
    endingId: 'shopkeeper',
    description: '광장 → 행상인 → 정착 → shopkeeper 엔딩',
    character: makeCharacter({ cha: 9 }, 'scholar'),
    defaultRng: 'success',
    steps: [
      { choice: 'to_peddler', expectScene: 'peddler' },
      { choice: 'settle_market' },
    ],
  },
  {
    endingId: 'goblin_friend',
    description: '시장 buy → torch 획득 → 동굴 → 도깨비 cha ✓ → goblin_friend 엔딩',
    character: makeCharacter({ cha: 8 }, 'scholar'),
    defaultRng: 'success',
    steps: [
      { choice: 'to_market' },
      { choice: 'buy_supplies', expectInventory: ['bread', 'torch', 'herb'] },
      { choice: 'back_to_square', expectScene: 'town_square_dawn' },
      { choice: 'to_cave', expectScene: 'cave_entry' },
      { choice: 'enter_with_torch', expectScene: 'cave_inside' },
      { choice: 'meet_goblin', expectScene: 'goblin_encounter' },
      { choice: 'befriend_goblin' },
    ],
  },
  {
    endingId: 'wizard_apprentice',
    description: '산기슭 → 마법사 wis 11 ✓ → int 13 ✓ → 제자',
    character: makeCharacter({ wis: 9, int: 10 }, 'scholar'),
    defaultRng: 'success',
    steps: [
      { choice: 'to_mountain_foot', expectScene: 'mountain_foot' },
      { choice: 'find_wizard', expectScene: 'wizard_meeting' },
      { choice: 'become_apprentice' },
    ],
  },
];

describe('web-adventure e2e 풀 플레이 (6 엔딩 시퀀스)', () => {
  // ── 사전 검증: 6 엔딩 모두 sceneRegistry 에 isEnding 으로 등록되어 있는지
  test('sceneRegistry 에 6 엔딩 (main/spirit/fail/shopkeeper/goblin_friend/wizard_apprentice) 모두 isEnding 으로 존재', () => {
    const endingIds = Object.values(scenes)
      .filter((s) => s.isEnding)
      .map((s) => s.endingId)
      .filter((e) => !!e) as string[];
    for (const expected of [
      'main',
      'spirit',
      'fail',
      'shopkeeper',
      'goblin_friend',
      'wizard_apprentice',
    ]) {
      expect(endingIds).toContain(expected);
    }
  });

  // ── 각 엔딩 시나리오 통합 실행
  test.each(SCENARIOS)(
    '$endingId 엔딩 도달: $description',
    ({ endingId, character, defaultRng, steps }) => {
      const rngDefault = rngForMode(defaultRng);
      let state = startGame(character);
      expect(state.phase).toBe('playing');

      for (const step of steps) {
        const rng = step.rngOverride ? rngForMode(step.rngOverride) : rngDefault;
        state = makeChoice(state, step.choice, rng);
        if (step.expectScene && state.phase === 'playing') {
          expect(state.currentScene).toBe(step.expectScene);
        }
        if (step.expectInventory && state.phase === 'playing') {
          for (const item of step.expectInventory) {
            expect(state.character.inventory).toContain(item);
          }
        }
      }

      // 최종 → ended + endingId 일치
      expect(state.phase).toBe('ended');
      if (state.phase === 'ended') {
        expect(state.endingId).toBe(endingId);
      }
    },
  );

  // ── 회귀 보호: 6 엔딩 시퀀스가 *모두* 통과해야 (개수 확인)
  test('6 엔딩 모두 자동 시퀀스로 도달 가능한 데이터 테이블이 정의돼 있다', () => {
    const ids = new Set(SCENARIOS.map((s) => s.endingId));
    expect(ids.size).toBe(6);
    expect([...ids].sort()).toEqual(
      ['fail', 'goblin_friend', 'main', 'shopkeeper', 'spirit', 'wizard_apprentice'],
    );
  });
});
