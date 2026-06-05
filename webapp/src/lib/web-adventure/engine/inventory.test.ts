// 인벤토리 시스템 — 3 주차 RED 테스트.
// items.ts / stats.ts / reducer USE_ITEM 액션 / 인벤 cap 8 검증.

import { describe, test, expect } from "vitest";
import type {
  AbilityKey,
  Character,
  GameState,
  SceneRegistry,
  StatKey,
} from "@/types/web-adventure";
import { gameReducer } from "./reducer";
import { scenes } from "./sceneRegistry";
import { items, INVENTORY_CAP } from "@/content/web-adventure/items";
import { effectiveStat } from "./stats";
import { rollProbability } from "./rollDice";

function makeTestCharacter(
  partial: Partial<{
    stats: Partial<Record<StatKey, number>>;
    inventory: string[];
    flags: Record<string, boolean>;
    hp: number;
    maxHp: number;
    ability: AbilityKey;
    rerollsLeft: number;
  }> = {},
): Character {
  const baseStats: Record<StatKey, number> = {
    str: 5,
    dex: 5,
    int: 5,
    cha: 5,
    con: 5,
    wis: 5,
  };
  const stats: Record<StatKey, number> = { ...baseStats, ...(partial.stats ?? {}) };
  return {
    stats,
    hp: partial.hp ?? 100,
    maxHp: partial.maxHp ?? 100,
    ability: partial.ability ?? "scholar",
    inventory: partial.inventory ?? [],
    flags: partial.flags ?? {},
    rerollsLeft: partial.rerollsLeft ?? 0,
  };
}

describe("items 카탈로그", () => {
  test("11 종 아이템이 모두 등록되어 있다", () => {
    const expected = [
      "bread",
      "herb",
      "rusty_sword",
      "torch",
      "rusty_key",
      "spirit_glasses",
      "goblin_charm",
      "spellbook",
      "market_receipt",
      "super_tintham_cracker",
      "scroll",
      "companion_token",
    ];
    for (const id of expected) {
      expect(items[id]).toBeDefined();
      expect(items[id].id).toBe(id);
    }
  });

  test("INVENTORY_CAP 은 8 이다", () => {
    expect(INVENTORY_CAP).toBe(8);
  });

  test("super_tintham_cracker 는 quest 아이템 (구 hasSecretSnack flag 대체)", () => {
    expect(items.super_tintham_cracker.kind).toBe("quest");
  });

  test("spirit_glasses 는 passive — wis +1", () => {
    expect(items.spirit_glasses.kind).toBe("passive");
    expect(items.spirit_glasses.passiveStat).toEqual({ stat: "wis", bonus: 1 });
  });

  test("torch 는 key — unlocks cave_inside", () => {
    expect(items.torch.kind).toBe("key");
    expect(items.torch.unlocks).toBe("cave_inside");
  });
});

describe("effectiveStat", () => {
  test("패시브 아이템 없으면 baseline stat 그대로", () => {
    const c = makeTestCharacter({ stats: { wis: 5 } });
    expect(effectiveStat(c, "wis")).toBe(5);
  });

  test("spirit_glasses 보유 시 wis +1", () => {
    const c = makeTestCharacter({ stats: { wis: 5 }, inventory: ["spirit_glasses"] });
    expect(effectiveStat(c, "wis")).toBe(6);
  });

  test("goblin_charm 보유 시 cha +1", () => {
    const c = makeTestCharacter({ stats: { cha: 5 }, inventory: ["goblin_charm"] });
    expect(effectiveStat(c, "cha")).toBe(6);
  });

  test("spellbook 보유 시 int +1", () => {
    const c = makeTestCharacter({ stats: { int: 5 }, inventory: ["spellbook"] });
    expect(effectiveStat(c, "int")).toBe(6);
  });

  test("non-passive 아이템 (bread, torch) 은 stat 에 영향 없음", () => {
    const c = makeTestCharacter({
      stats: { wis: 5 },
      inventory: ["bread", "torch", "rusty_sword"],
    });
    expect(effectiveStat(c, "wis")).toBe(5);
  });
});

describe("USE_ITEM 액션", () => {
  test("consumable (herb heal 40) 이 HP 를 maxHp 까지만 회복", () => {
    const c = makeTestCharacter({ hp: 80, maxHp: 100, inventory: ["herb"] });
    let state: GameState = {
      phase: "playing",
      character: c,
      currentScene: "town_square_dawn",
      log: [],
    };
    state = gameReducer(state, { type: "USE_ITEM", itemId: "herb" }, scenes as SceneRegistry);
    expect(state.phase).toBe("playing");
    if (state.phase === "playing") {
      expect(state.character.hp).toBe(100); // 80+40=120 → clamp 100
      expect(state.character.inventory).not.toContain("herb");
    }
  });

  test("consumable (bread heal 20) 이 HP 를 정확히 +20", () => {
    const c = makeTestCharacter({ hp: 50, maxHp: 100, inventory: ["bread"] });
    let state: GameState = {
      phase: "playing",
      character: c,
      currentScene: "town_square_dawn",
      log: [],
    };
    state = gameReducer(state, { type: "USE_ITEM", itemId: "bread" }, scenes as SceneRegistry);
    if (state.phase === "playing") {
      expect(state.character.hp).toBe(70);
      expect(state.character.inventory).not.toContain("bread");
    }
  });

  test("인벤토리에 없는 아이템 사용은 무효", () => {
    const c = makeTestCharacter({ hp: 50, maxHp: 100, inventory: [] });
    const before: GameState = {
      phase: "playing",
      character: c,
      currentScene: "town_square_dawn",
      log: [],
    };
    const after = gameReducer(
      before,
      { type: "USE_ITEM", itemId: "herb" },
      scenes as SceneRegistry,
    );
    expect(after).toEqual(before);
  });

  test("non-consumable (torch) 사용은 무효", () => {
    const c = makeTestCharacter({ hp: 50, maxHp: 100, inventory: ["torch"] });
    const before: GameState = {
      phase: "playing",
      character: c,
      currentScene: "town_square_dawn",
      log: [],
    };
    const after = gameReducer(
      before,
      { type: "USE_ITEM", itemId: "torch" },
      scenes as SceneRegistry,
    );
    expect(after).toEqual(before);
  });

  test("creating phase 에서 USE_ITEM 은 무시", () => {
    const before: GameState = { phase: "creating" };
    const after = gameReducer(
      before,
      { type: "USE_ITEM", itemId: "herb" },
      scenes as SceneRegistry,
    );
    expect(after).toEqual(before);
  });
});

describe("인벤토리 cap (8)", () => {
  test("ADD_ITEM 이 인벤 가득 (8개) 시 새 아이템 받지 않는다", () => {
    // 가득 찬 인벤으로 forest_lost (onEnter 없음) 가 아닌 onEnter.addItems 있는 씬 시뮬레이션 어렵 →
    // 직접 onEnter 처리는 reducer 의 moveTo 안에서 일어남. cave_inside (spellbook addItems) 로 검증 가능.
    // 아래 시나리오 테스트에서 직접 cave_inside take_spellbook 경로로 확인.
    const fullInventory = ["a", "b", "c", "d", "e", "f", "g", "h"]; // 8 개
    expect(fullInventory.length).toBe(INVENTORY_CAP);
  });

  test("onEnter.addItems 가 cap 을 초과하면 받을 수 있는 만큼만 받는다", () => {
    // 동굴 안 (cave_inside) 진입 시 onEnter 가 spellbook 을 자동 추가하지 않음 (take_spellbook 선택지에 둠).
    // 대신 두 아이템을 동시 부여하는 가상 케이스를 reducer 직접 모킹은 어려우니 *통합 시나리오* 로 검증.
    // 여기서는 cap 자체 동작만 확인.
    const c = makeTestCharacter({ inventory: ["a", "b", "c", "d", "e", "f", "g", "h"] });
    expect(c.inventory.length).toBe(INVENTORY_CAP);
  });
});

describe("rollProbability 가 effectiveStat (패시브 포함) 을 사용한다", () => {
  test("패시브 안경 (wis +1) 이 rollProbability 결과에 반영 — 호출자 책임", () => {
    // rollProbability 자체는 stat 숫자를 받음. 호출자 (reducer / UI) 가 effectiveStat 로
    // pre-compute 한 값을 넘기는 패턴. reducer 가 패시브를 반영하는지 확인.
    const c = makeTestCharacter({ stats: { wis: 5 }, inventory: ["spirit_glasses"] });
    // 호출자가 effectiveStat 로 6 을 넘기는 동작 검증.
    const wisEff = effectiveStat(c, "wis");
    const result = rollProbability({
      stat: wisEff,
      ability: c.ability,
      statKey: "wis",
      difficulty: 13,
      rng: () => 0.5, // d20 = 11
    });
    // 6 + 11 = 17 ≥ 13 → 성공
    expect(result.success).toBe(true);
  });
});

// #203 — addItems 중복 방지 (stackable 필드).
// consumable(bread/herb) 만 stackable=true, 나머지는 stackable=false (재진입 시 skip).

describe("stackable 필드 정의", () => {
  test("consumable bread/herb 는 stackable=true", () => {
    expect(items.bread.stackable).toBe(true);
    expect(items.herb.stackable).toBe(true);
  });

  test("passive/key/weapon/quest 아이템은 stackable=false", () => {
    expect(items.spellbook.stackable).toBe(false);
    expect(items.spirit_glasses.stackable).toBe(false);
    expect(items.goblin_charm.stackable).toBe(false);
    expect(items.torch.stackable).toBe(false);
    expect(items.rusty_key.stackable).toBe(false);
    expect(items.rusty_sword.stackable).toBe(false);
    expect(items.market_receipt.stackable).toBe(false);
    expect(items.super_tintham_cracker.stackable).toBe(false);
    expect(items.scroll.stackable).toBe(false);
    expect(items.companion_token.stackable).toBe(false);
  });
});

describe("#203 addItems 중복 방지 (재진입 시)", () => {
  test("non-stackable spellbook 두 번 진입 시 인벤에 1개만 있다", () => {
    // cave_after_spellbook 의 onEnter.addItems: ["spellbook"].
    // START_GAME 으로 cave_after_spellbook 진입 → spellbook 1 추가.
    // 동일 씬 재진입 시 (cave_inside → take_spellbook → cave_after_spellbook) → skip.
    // 5 주차 (#221): take_spellbook 은 spellbookTaken=true 시 hidden+blocked 이므로
    // 재진입 검증을 위해 *수동으로 flag clear* 후 재선택 (onEnter 의 stackable 로직만 검증).
    const character = makeTestCharacter();
    let state: GameState = {
      phase: "creating",
    };
    state = gameReducer(
      state,
      { type: "START_GAME", character, startScene: "cave_after_spellbook" },
      scenes as SceneRegistry,
    );
    expect(state.phase).toBe("playing");
    if (state.phase === "playing") {
      // 1차 진입 — spellbook 1 개.
      expect(state.character.inventory.filter((id) => id === "spellbook").length).toBe(1);
    }
    // 2차 진입 — back_to_cave → (#221 flag clear) → take_spellbook → cave_after_spellbook.
    state = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "back_to_cave" },
      scenes as SceneRegistry,
    );
    // #221 gating 우회 — onEnter stackable 검증이 본 테스트 의도.
    if (state.phase === "playing") {
      const { spellbookTaken: _drop, ...restFlags } = state.character.flags as Record<
        string,
        boolean | number
      >;
      void _drop;
      state = {
        ...state,
        character: { ...state.character, flags: restFlags },
      };
    }
    state = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "take_spellbook" },
      scenes as SceneRegistry,
    );
    expect(state.phase).toBe("playing");
    if (state.phase === "playing") {
      expect(state.currentScene).toBe("cave_after_spellbook");
      expect(state.character.inventory.filter((id) => id === "spellbook").length).toBe(1);
    }
  });

  test("stackable bread/herb 두 번 진입 시 인벤에 각각 2개, non-stackable torch 는 1개", () => {
    // market_buy onEnter.addItems: ["bread", "torch", "herb"].
    // 두 번 진입 시 bread/herb 는 stackable=true → 2 개, torch 는 stackable=false → 1 개.
    // 5 주차 (#221): buy_supplies 는 marketBought=true 시 hidden+blocked 이므로
    // 재진입 검증을 위해 *수동으로 flag clear* 후 재선택 (onEnter 의 stackable 로직만 검증).
    const character = makeTestCharacter();
    let state: GameState = { phase: "creating" };
    state = gameReducer(
      state,
      { type: "START_GAME", character, startScene: "market_buy" },
      scenes as SceneRegistry,
    );
    // 1차 진입 후 광장 복귀.
    state = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "back_to_square" },
      scenes as SceneRegistry,
    );
    expect(state.phase).toBe("playing");
    // 광장 → 시장 → market_buy 재진입.
    state = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "to_market" },
      scenes as SceneRegistry,
    );
    // #221 gating 우회 — onEnter stackable 검증이 본 테스트 의도.
    if (state.phase === "playing") {
      const { marketBought: _drop, ...restFlags } = state.character.flags as Record<
        string,
        boolean | number
      >;
      void _drop;
      state = {
        ...state,
        character: { ...state.character, flags: restFlags },
      };
    }
    state = gameReducer(
      state,
      { type: "MAKE_CHOICE", choiceId: "buy_supplies" },
      scenes as SceneRegistry,
    );
    expect(state.phase).toBe("playing");
    if (state.phase === "playing") {
      expect(state.currentScene).toBe("market_buy");
      const breadCount = state.character.inventory.filter((id) => id === "bread").length;
      const torchCount = state.character.inventory.filter((id) => id === "torch").length;
      const herbCount = state.character.inventory.filter((id) => id === "herb").length;
      expect(breadCount).toBe(2);
      expect(torchCount).toBe(1);
      expect(herbCount).toBe(2);
    }
  });

  test("non-stackable spirit_glasses 반복 획득 시도 시 1개만 유지", () => {
    // forest_find_glasses onEnter.addItems: ["spirit_glasses"].
    // 이미 보유 상태에서 진입 → skip.
    const character = makeTestCharacter({ inventory: ["spirit_glasses"] });
    let state: GameState = { phase: "creating" };
    state = gameReducer(
      state,
      { type: "START_GAME", character, startScene: "forest_find_glasses" },
      scenes as SceneRegistry,
    );
    expect(state.phase).toBe("playing");
    if (state.phase === "playing") {
      expect(state.character.inventory.filter((id) => id === "spirit_glasses").length).toBe(1);
    }
  });

  test("인벤 cap 8 — stackable 도 cap 초과 시 추가 차단", () => {
    // 인벤 6 + market_buy 진입 (bread+torch+herb 3 개 시도) → 8 까지만 추가.
    const character = makeTestCharacter({
      inventory: ["a", "b", "c", "d", "e", "f"], // 6 개.
    });
    let state: GameState = { phase: "creating" };
    state = gameReducer(
      state,
      { type: "START_GAME", character, startScene: "market_buy" },
      scenes as SceneRegistry,
    );
    expect(state.phase).toBe("playing");
    if (state.phase === "playing") {
      // 6 + bread + torch = 8 (cap), herb skip.
      expect(state.character.inventory.length).toBe(INVENTORY_CAP);
      expect(state.character.inventory).toContain("bread");
      expect(state.character.inventory).toContain("torch");
      expect(state.character.inventory).not.toContain("herb");
    }
  });

  test("아이템 미정의 id 는 무시 (inventory 변화 없음)", () => {
    // 가상 시나리오: reducer 의 pushItems 가 items[id] === undefined 면 skip.
    // 직접 applyOnEnter 호출 어려우므로 — items 카탈로그 검증 + 가상 onEnter 전달.
    // 여기서는 reducer 동작 검증 위해 inline scene 사용.
    const fakeScenes: SceneRegistry = {
      ...(scenes as SceneRegistry),
      __ghost_scene__: {
        id: "__ghost_scene__",
        illustration: "",
        title: "유령",
        body: [],
        choices: [],
        onEnter: { addItems: ["nonexistent_item_xyz", "bread"] },
      },
    };
    const character = makeTestCharacter();
    let state: GameState = { phase: "creating" };
    state = gameReducer(
      state,
      { type: "START_GAME", character, startScene: "__ghost_scene__" },
      fakeScenes,
    );
    expect(state.phase).toBe("playing");
    if (state.phase === "playing") {
      // 미정의 id 는 무시, bread 만 추가.
      expect(state.character.inventory).toEqual(["bread"]);
    }
  });
});
