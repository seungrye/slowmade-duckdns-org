// 에테르니아 덱빌딩 로그라이크 1 차 — 순수 규칙 모듈의 단위 테스트.
//
// 난수(eternia-deck-rng) · 카드 데이터(eternia-deck-cards) · 전투 규칙
// (eternia-deck-combat) 셋을 한 파일에서 본다. 1 차에는 화면도 라우트도 없으므로
// 여기가 유일한 테스트다.
//
// 특정 카드를 손에 쥐어야 할 때 **시드를 찍어 맞추지 않는다.** 상태가 평범한 값이니
// 손패와 기력을 직접 지어서 넘긴다 (makeRun). 시드 탐색은 구현이 바뀔 때마다 깨진다.

import { describe, it, expect } from "vitest";
import { CARDS, STARTER_DECK, type Card } from "./eternia-deck-cards";
import { nextRandom, shuffle } from "./eternia-deck-rng";
import { createRun, endTurn, playCard, type RunState } from "./eternia-deck-combat";

// ── 도우미 ────────────────────────────────────────────────────────────────

/**
 * 회차 상태를 손으로 짓는다.
 *
 * createRun 을 부르지 않는다 — 부르면 껍데기의 "createRun 미구현" 하나로 모든 실패가
 * 뭉쳐서 어느 규칙이 비었는지 안 보인다.
 */
function makeRun(overrides: Partial<RunState> = {}): RunState {
  return {
    rngState: 1,
    player: { hp: 50, block: 0, energy: 3 },
    enemy: {
      hp: 40,
      moves: [
        { kind: "attack", amount: 8 },
        { kind: "attack", amount: 12 },
      ],
      moveIndex: 0,
    },
    drawPile: [],
    hand: [],
    discardPile: [],
    turn: 1,
    outcome: "ongoing",
    ...overrides,
  };
}

/** 상태를 깊게 얼린다. 규칙이 입력을 건드리면 그 자리에서 TypeError 로 터진다. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value as Record<string, unknown>)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/** 세 더미에 든 카드 총수. 회차 내내 여덟 장이어야 한다. */
function totalCards(state: RunState): number {
  return state.hand.length + state.drawPile.length + state.discardPile.length;
}

/** 스펙의 카드 표. 이름·비용·수치가 글자 그대로 이것과 같아야 한다. */
const EXPECTED_CARDS: Card[] = [
  { id: "jab", name: "찌르기", cost: 0, effect: { kind: "damage", amount: 3 } },
  { id: "strike", name: "베기", cost: 1, effect: { kind: "damage", amount: 6 } },
  { id: "flurry", name: "난격", cost: 2, effect: { kind: "damage", amount: 9 } },
  { id: "heavy_strike", name: "내려치기", cost: 3, effect: { kind: "damage", amount: 14 } },
  { id: "sidestep", name: "흘리기", cost: 0, effect: { kind: "block", amount: 2 } },
  { id: "guard", name: "막기", cost: 1, effect: { kind: "block", amount: 5 } },
  { id: "brace", name: "버티기", cost: 2, effect: { kind: "block", amount: 9 } },
  { id: "iron_wall", name: "철벽", cost: 3, effect: { kind: "block", amount: 15 } },
];

// ── 난수 ──────────────────────────────────────────────────────────────────

// nextRandom — 상태 하나에서 [0, 1) 난수와 다음 상태를 낸다. 상태는 수 하나라야
// 저장·재개를 붙일 때 JSON 을 건널 수 있다.
describe("nextRandom", () => {
  it("같은 상태를 넣으면 늘 같은 값과 같은 다음 상태가 나온다", () => {
    const a = nextRandom(12345);
    const b = nextRandom(12345);
    expect(a.value).toBe(b.value);
    expect(a.state).toBe(b.state);
  });

  it("값이 0 이상 1 미만이다", () => {
    let state = 7;
    for (let i = 0; i < 200; i++) {
      const r = nextRandom(state);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      state = r.state;
    }
  });

  it("상태는 수 하나이고 JSON 을 거쳐 되돌려도 같다", () => {
    const r = nextRandom(42);
    expect(typeof r.state).toBe("number");
    expect(Number.isFinite(r.state)).toBe(true);
    expect(JSON.parse(JSON.stringify({ s: r.state })).s).toBe(r.state);
  });

  it("상태를 이어 넘기면 값이 고정되지 않고 흘러간다", () => {
    const values: number[] = [];
    let state = 3;
    for (let i = 0; i < 20; i++) {
      const r = nextRandom(state);
      values.push(r.value);
      state = r.state;
    }
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  it("시드 0 도 예외 없이 받는다", () => {
    expect(() => nextRandom(0)).not.toThrow();
  });
});

// shuffle — Fisher-Yates 로 섞은 **새** 배열과 다음 상태를 낸다. 입력 배열은 건드리지
// 않는다.
describe("shuffle", () => {
  it("입력 배열을 변형하지 않는다", () => {
    const input = ["a", "b", "c", "d", "e"];
    const before = [...input];
    shuffle(input, 99);
    expect(input).toEqual(before);
  });

  it("얼린 배열을 넘겨도 터지지 않는다 — 제자리에서 섞지 않는다는 뜻이다", () => {
    const frozen = Object.freeze(["a", "b", "c", "d", "e"]);
    expect(() => shuffle(frozen, 99)).not.toThrow();
  });

  it("같은 시드면 같은 결과를 낸다", () => {
    const input = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const first = shuffle(input, 2026);
    const second = shuffle(input, 2026);
    expect(first.items).toEqual(second.items);
    expect(first.state).toBe(second.state);
  });

  it("빈 배열을 예외 없이 받고 빈 배열을 낸다", () => {
    const result = shuffle([], 5);
    expect(result.items).toEqual([]);
    expect(typeof result.state).toBe("number");
  });

  it("한 장짜리 배열을 예외 없이 받고 그 한 장을 낸다", () => {
    const result = shuffle(["only"], 5);
    expect(result.items).toEqual(["only"]);
  });

  it("섞어도 원소 구성이 그대로다 — 사라지지도 늘어나지도 않는다", () => {
    const input = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const result = shuffle(input, 777);
    expect([...result.items].sort()).toEqual([...input].sort());
  });

  it("같은 값이 여러 개 든 배열도 개수를 보존한다", () => {
    const input = ["x", "x", "y", "x", "y"];
    const result = shuffle(input, 31337);
    expect(result.items.filter((v) => v === "x")).toHaveLength(3);
    expect(result.items.filter((v) => v === "y")).toHaveLength(2);
  });

  it("결과 배열은 입력과 다른 객체다", () => {
    const input = ["a", "b", "c"];
    expect(shuffle(input, 11).items).not.toBe(input);
  });

  it("시드를 갈면 순서가 갈린다", () => {
    const input = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const orders = [1, 2, 7, 42, 99, 2026, 31337, 777777].map((seed) =>
      shuffle(input, seed).items.join(","),
    );
    // 특정 두 시드를 찍어 맞추면 우연히 같은 순열이 나올 때 억울하게 깨진다.
    // 여덟 시드를 훑어 "시드가 결과를 가른다"는 성질만 본다.
    expect(new Set(orders).size).toBeGreaterThanOrEqual(4);
  });
});

// ── 카드 데이터 ───────────────────────────────────────────────────────────

// CARDS / STARTER_DECK — 여덟 장의 카드와, 그 여덟 장을 한 장씩 담은 시작 덱.
// effect 는 함수가 아니라 태그라야 직렬화를 건넌다.
describe("CARDS / STARTER_DECK", () => {
  it("카드가 정확히 여덟 장이다", () => {
    expect(CARDS).toHaveLength(8);
  });

  it.each(EXPECTED_CARDS)("$id 는 이름 $name, 비용 $cost 이다", (expected) => {
    const card = CARDS.find((c) => c.id === expected.id);
    expect(card).toBeDefined();
    expect(card).toEqual(expected);
  });

  it("id 는 영문 소문자와 밑줄만 쓴다 — 한글은 name 에만 둔다", () => {
    // 빈 배열을 훑으면 아무것도 검증하지 않은 채 초록이 된다. 장수부터 못박는다.
    expect(CARDS).toHaveLength(8);
    for (const card of CARDS) {
      expect(card.id).toMatch(/^[a-z_]+$/);
      expect(card.name).toMatch(/^[가-힣]+$/);
    }
  });

  it("effect 는 함수가 아니라 태그다 — JSON 을 거쳐도 같다", () => {
    expect(CARDS).toHaveLength(8);
    for (const card of CARDS) {
      expect(typeof card.effect).toBe("object");
      expect(["damage", "block"]).toContain(card.effect.kind);
    }
    expect(JSON.parse(JSON.stringify(CARDS))).toEqual(CARDS);
  });

  it("STARTER_DECK 은 여덟 장이고 각 카드를 한 장씩만 담는다", () => {
    expect(STARTER_DECK).toHaveLength(8);
    expect(new Set(STARTER_DECK).size).toBe(8);
    expect([...STARTER_DECK].sort()).toEqual(CARDS.map((c) => c.id).sort());
  });
});

// ── 회차 시작 ─────────────────────────────────────────────────────────────

// createRun — 시드에서 회차 시작 상태를 짓는다. 시드는 회차 번호에서 파생시키지 않고
// 통째로 받는다.
describe("createRun", () => {
  it("같은 시드로 두 번 부르면 상태가 완전히 같다", () => {
    expect(createRun(12345)).toEqual(createRun(12345));
  });

  it("시드를 갈면 카드가 놓인 순서가 갈린다", () => {
    const orders = [1, 2, 7, 42, 99, 2026, 31337, 777777].map((seed) => {
      const run = createRun(seed);
      return [...run.hand, ...run.drawPile].join(",");
    });
    expect(new Set(orders).size).toBeGreaterThanOrEqual(4);
  });

  it("손패 5 장, 뽑기 더미 3 장, 버림 더미 0 장으로 시작한다", () => {
    const run = createRun(42);
    expect(run.hand).toHaveLength(5);
    expect(run.drawPile).toHaveLength(3);
    expect(run.discardPile).toHaveLength(0);
  });

  it("세 더미를 합치면 STARTER_DECK 과 같은 여덟 장이다", () => {
    const run = createRun(42);
    const all = [...run.hand, ...run.drawPile, ...run.discardPile];
    expect(all.sort()).toEqual([...STARTER_DECK].sort());
  });

  it("플레이어는 hp 50, 방어도 0, 기력 3 으로 시작한다", () => {
    expect(createRun(42).player).toEqual({ hp: 50, block: 0, energy: 3 });
  });

  it("적 기본값은 hp 40 이고 8 / 12 짜리 공격 둘을 0 번 칸부터 돌린다", () => {
    expect(createRun(42).enemy).toEqual({
      hp: 40,
      moves: [
        { kind: "attack", amount: 8 },
        { kind: "attack", amount: 12 },
      ],
      moveIndex: 0,
    });
  });

  it("턴은 1 이고 결말은 ongoing 이다", () => {
    const run = createRun(42);
    expect(run.turn).toBe(1);
    expect(run.outcome).toBe("ongoing");
  });

  it("적을 넘기면 그 값을 쓴다", () => {
    const run = createRun(42, { hp: 12, moves: [{ kind: "attack", amount: 3 }] });
    expect(run.enemy.hp).toBe(12);
    expect(run.enemy.moves).toEqual([{ kind: "attack", amount: 3 }]);
    expect(run.enemy.moveIndex).toBe(0);
  });

  it("JSON 직렬화를 거쳐 되돌려도 같은 값이다", () => {
    const run = createRun(2026);
    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
    expect(typeof run.rngState).toBe("number");
  });

  it("두 번 부른 결과가 배열을 공유하지 않는다", () => {
    const first = createRun(42);
    const second = createRun(42);
    first.hand.push("jab");
    expect(second.hand).toHaveLength(5);
  });
});

// ── 카드 내기 ─────────────────────────────────────────────────────────────

// playCard — 손패에서 카드 한 장을 낸다. 낼 수 없으면 예외를 던지지 않고 상태를 값으로
// 그대로 돌려준다.
describe("playCard — 낼 수 없는 경우", () => {
  it("기력이 비용보다 모자라면 상태가 안 바뀐다", () => {
    const state = makeRun({ hand: ["iron_wall"], player: { hp: 50, block: 0, energy: 2 } });
    expect(playCard(state, "iron_wall")).toEqual(state);
  });

  it("손패에 없는 id 면 상태가 안 바뀐다", () => {
    const state = makeRun({ hand: ["jab"], discardPile: ["guard"] });
    expect(playCard(state, "guard")).toEqual(state);
  });

  it("카드 표에도 없는 id 면 예외 없이 상태가 안 바뀐다", () => {
    const state = makeRun({ hand: ["jab"] });
    expect(() => playCard(state, "no_such_card")).not.toThrow();
    expect(playCard(state, "no_such_card")).toEqual(state);
  });

  it("결말이 won 이면 낼 수 있는 카드라도 상태가 안 바뀐다", () => {
    const state = makeRun({ hand: ["jab"], outcome: "won" });
    expect(playCard(state, "jab")).toEqual(state);
  });

  it("결말이 lost 면 낼 수 있는 카드라도 상태가 안 바뀐다", () => {
    const state = makeRun({ hand: ["jab"], outcome: "lost" });
    expect(playCard(state, "jab")).toEqual(state);
  });
});

// playCard — 낼 수 있을 때의 전이. 기력 차감 · 손패에서 한 장 · 버림 더미 맨 뒤.
describe("playCard — 낼 수 있는 경우", () => {
  it("기력에서 비용을 빼고 손패의 카드를 버림 더미 맨 뒤에 넣는다", () => {
    const state = makeRun({ hand: ["guard", "jab"], discardPile: ["strike"] });
    const next = playCard(state, "guard");
    expect(next.player.energy).toBe(2); // 3 - 1
    expect(next.hand).toEqual(["jab"]);
    expect(next.discardPile).toEqual(["strike", "guard"]);
  });

  it("기력이 비용과 정확히 같으면 낼 수 있고 기력이 0 이 된다", () => {
    const state = makeRun({ hand: ["iron_wall"], player: { hp: 50, block: 0, energy: 3 } });
    const next = playCard(state, "iron_wall");
    expect(next.player.energy).toBe(0);
    expect(next.player.block).toBe(15);
  });

  it("비용 0 짜리는 기력이 0 이어도 낼 수 있다", () => {
    const state = makeRun({ hand: ["jab"], player: { hp: 50, block: 0, energy: 0 } });
    const next = playCard(state, "jab");
    expect(next.player.energy).toBe(0);
    expect(next.enemy.hp).toBe(37); // 40 - 3
  });

  it("같은 id 가 손패에 둘이면 하나만 빠진다", () => {
    const state = makeRun({ hand: ["jab", "jab"] });
    const next = playCard(state, "jab");
    expect(next.hand).toEqual(["jab"]);
    expect(next.discardPile).toEqual(["jab"]);
  });

  it("damage 카드는 적 hp 를 그만큼 깎는다 — 적 방어도는 없다", () => {
    const state = makeRun({ hand: ["heavy_strike"] });
    expect(playCard(state, "heavy_strike").enemy.hp).toBe(26); // 40 - 14
  });

  it("block 카드는 플레이어 방어도를 그만큼 올린다", () => {
    const state = makeRun({ hand: ["guard"] });
    expect(playCard(state, "guard").player.block).toBe(5);
  });

  it("방어도는 누적되고 상한이 없다", () => {
    const state = makeRun({
      hand: ["iron_wall", "sidestep"],
      player: { hp: 50, block: 100, energy: 3 },
    });
    const after = playCard(playCard(state, "iron_wall"), "sidestep");
    expect(after.player.block).toBe(117); // 100 + 15 + 2
  });

  it("block 카드는 적 hp 를, damage 카드는 플레이어 방어도를 건드리지 않는다", () => {
    const state = makeRun({ hand: ["guard", "jab"] });
    const afterGuard = playCard(state, "guard");
    expect(afterGuard.enemy.hp).toBe(40);
    const afterJab = playCard(afterGuard, "jab");
    expect(afterJab.player.block).toBe(5);
  });

  it("적 hp 가 정확히 0 이 되면 그 자리에서 won 이다", () => {
    const state = makeRun({ hand: ["jab"], enemy: { hp: 3, moves: [{ kind: "attack", amount: 8 }], moveIndex: 0 } });
    const next = playCard(state, "jab");
    expect(next.enemy.hp).toBe(0);
    expect(next.outcome).toBe("won");
  });

  it("적 hp 는 음수로 남아도 되고 결말은 won 이다", () => {
    const state = makeRun({ hand: ["heavy_strike"], enemy: { hp: 2, moves: [{ kind: "attack", amount: 8 }], moveIndex: 0 } });
    const next = playCard(state, "heavy_strike");
    expect(next.enemy.hp).toBe(-12);
    expect(next.outcome).toBe("won");
  });

  it("적을 눕힌 뒤에는 playCard 도 endTurn 도 상태를 안 바꾼다", () => {
    const state = makeRun({
      hand: ["jab", "guard"],
      enemy: { hp: 3, moves: [{ kind: "attack", amount: 8 }], moveIndex: 0 },
    });
    const won = playCard(state, "jab");
    expect(won.outcome).toBe("won");
    expect(playCard(won, "guard")).toEqual(won);
    expect(endTurn(won)).toEqual(won);
  });

  it("적을 눕혀도 턴은 안 올라간다", () => {
    const state = makeRun({ hand: ["jab"], enemy: { hp: 1, moves: [{ kind: "attack", amount: 8 }], moveIndex: 0 }, turn: 4 });
    expect(playCard(state, "jab").turn).toBe(4);
  });

  it("입력 상태를 변형하지 않는다", () => {
    const state = makeRun({ hand: ["guard", "jab"], discardPile: ["strike"] });
    const snapshot = structuredClone(state);
    playCard(state, "guard");
    expect(state).toEqual(snapshot);
  });

  it("얼린 상태를 넘겨도 터지지 않는다", () => {
    const state = deepFreeze(makeRun({ hand: ["guard"] }));
    expect(() => playCard(state, "guard")).not.toThrow();
  });
});

// ── 턴 넘기기 ─────────────────────────────────────────────────────────────

// endTurn — 손패를 버리고, 적의 예고된 행동을 맞고, 방어도를 털고, 살아 있으면 다음
// 턴을 연다.
describe("endTurn — 방어도와 피해", () => {
  it("피해가 방어도보다 작으면 hp 가 안 깎인다", () => {
    const state = makeRun({
      player: { hp: 50, block: 15, energy: 0 },
      enemy: { hp: 40, moves: [{ kind: "attack", amount: 8 }], moveIndex: 0 },
    });
    expect(endTurn(state).player.hp).toBe(50);
  });

  it("피해와 방어도가 정확히 같으면 hp 가 안 깎인다", () => {
    const state = makeRun({
      player: { hp: 50, block: 8, energy: 0 },
      enemy: { hp: 40, moves: [{ kind: "attack", amount: 8 }], moveIndex: 0 },
    });
    expect(endTurn(state).player.hp).toBe(50);
  });

  it("피해가 방어도보다 크면 차액만큼만 깎인다", () => {
    const state = makeRun({
      player: { hp: 50, block: 5, energy: 0 },
      enemy: { hp: 40, moves: [{ kind: "attack", amount: 12 }], moveIndex: 0 },
    });
    expect(endTurn(state).player.hp).toBe(43); // 50 - (12 - 5)
  });

  it("방어도가 0 이면 피해를 그대로 받는다", () => {
    const state = makeRun({
      player: { hp: 50, block: 0, energy: 0 },
      enemy: { hp: 40, moves: [{ kind: "attack", amount: 12 }], moveIndex: 0 },
    });
    expect(endTurn(state).player.hp).toBe(38);
  });

  it("방어도는 다음 턴으로 안 넘어간다 — 막기를 낸 다음 턴 시작 시 0 이다", () => {
    const state = makeRun({ hand: ["guard"] });
    const afterGuard = playCard(state, "guard");
    expect(afterGuard.player.block).toBe(5);
    expect(endTurn(afterGuard).player.block).toBe(0);
  });

  it("남아돌 만큼 막아도 방어도는 0 으로 털린다", () => {
    const state = makeRun({
      player: { hp: 50, block: 100, energy: 0 },
      enemy: { hp: 40, moves: [{ kind: "attack", amount: 8 }], moveIndex: 0 },
    });
    const next = endTurn(state);
    expect(next.player.block).toBe(0);
    expect(next.player.hp).toBe(50);
  });
});

// endTurn — 적 행동은 시드가 아니라 moves 를 순서대로 돈다.
describe("endTurn — 적 행동 순환", () => {
  it("1 턴 끝에 8, 2 턴 끝에 12, 3 턴 끝에 다시 8 을 쓴다", () => {
    let state = makeRun({ player: { hp: 100, block: 0, energy: 3 } });
    state = endTurn(state);
    expect(state.player.hp).toBe(92);
    state = endTurn(state);
    expect(state.player.hp).toBe(80);
    state = endTurn(state);
    expect(state.player.hp).toBe(72);
  });

  it("moveIndex 가 매 턴 다음 칸으로 가고 끝에 닿으면 처음으로 돌아온다", () => {
    let state = makeRun({ player: { hp: 100, block: 0, energy: 3 } });
    expect(state.enemy.moveIndex).toBe(0);
    state = endTurn(state);
    expect(state.enemy.moveIndex).toBe(1);
    state = endTurn(state);
    expect(state.enemy.moveIndex).toBe(0);
  });

  it("행동이 하나뿐이면 늘 그 자리에 머문다", () => {
    const state = makeRun({
      player: { hp: 100, block: 0, energy: 3 },
      enemy: { hp: 40, moves: [{ kind: "attack", amount: 5 }], moveIndex: 0 },
    });
    const next = endTurn(state);
    expect(next.enemy.moveIndex).toBe(0);
    expect(next.player.hp).toBe(95);
  });

  it("moveIndex 가 마지막 칸이면 그 행동을 쓰고 0 으로 돌아온다", () => {
    const state = makeRun({ player: { hp: 100, block: 0, energy: 3 }, enemy: { hp: 40, moves: [{ kind: "attack", amount: 8 }, { kind: "attack", amount: 12 }], moveIndex: 1 } });
    const next = endTurn(state);
    expect(next.player.hp).toBe(88); // 12 짜리를 맞았다
    expect(next.enemy.moveIndex).toBe(0);
  });
});

// endTurn — 더미 돌리기. 여덟 장이 사라지지도 늘어나지도 않는다.
describe("endTurn — 더미와 뽑기", () => {
  it("손패를 전부 버림 더미 뒤로 보내고 새로 다섯 장을 뽑는다", () => {
    const state = makeRun({
      hand: ["jab", "guard"],
      drawPile: ["strike", "flurry", "brace", "sidestep", "iron_wall"],
      discardPile: ["heavy_strike"],
      player: { hp: 100, block: 0, energy: 0 },
    });
    const next = endTurn(state);
    expect(next.hand).toEqual(["strike", "flurry", "brace", "sidestep", "iron_wall"]);
    expect(next.drawPile).toEqual([]);
    expect(next.discardPile).toEqual(["heavy_strike", "jab", "guard"]);
  });

  it("뽑는 도중 뽑기 더미가 비면 버림 더미를 섞어 되돌리고 마저 뽑는다", () => {
    const state = makeRun({
      hand: [],
      drawPile: ["jab", "guard"],
      discardPile: ["strike", "flurry", "brace"],
      player: { hp: 100, block: 0, energy: 0 },
    });
    const next = endTurn(state);
    expect(next.hand).toHaveLength(5);
    expect(next.drawPile).toEqual([]);
    expect(next.discardPile).toEqual([]);
    // 앞의 두 장은 되돌리기 전 뽑기 더미에서 순서대로 나온다.
    expect(next.hand.slice(0, 2)).toEqual(["jab", "guard"]);
    expect([...next.hand].sort()).toEqual(["brace", "flurry", "guard", "jab", "strike"]);
  });

  it("뽑기 더미도 버림 더미도 비면 예외 없이 손패가 빈 채로 턴이 넘어간다", () => {
    const state = makeRun({
      hand: [],
      drawPile: [],
      discardPile: [],
      player: { hp: 100, block: 0, energy: 0 },
    });
    expect(() => endTurn(state)).not.toThrow();
    const next = endTurn(state);
    expect(next.hand).toEqual([]);
    expect(next.drawPile).toEqual([]);
    expect(next.discardPile).toEqual([]);
    expect(next.turn).toBe(2);
    expect(next.outcome).toBe("ongoing");
  });

  it("다섯 장에 모자라면 있는 만큼만 뽑는다", () => {
    const state = makeRun({
      hand: ["jab", "guard"],
      drawPile: [],
      discardPile: [],
      player: { hp: 100, block: 0, energy: 0 },
    });
    const next = endTurn(state);
    expect(next.hand).toHaveLength(2);
    expect([...next.hand].sort()).toEqual(["guard", "jab"]);
    expect(next.drawPile).toEqual([]);
    expect(next.discardPile).toEqual([]);
  });

  it("턴이 올라가고 기력이 3 으로 돌아온다", () => {
    const state = makeRun({ player: { hp: 100, block: 0, energy: 0 }, turn: 5 });
    const next = endTurn(state);
    expect(next.turn).toBe(6);
    expect(next.player.energy).toBe(3);
  });

  it("세 턴을 돌려도 카드 여덟 장이 사라지지도 늘어나지도 않는다", () => {
    let run = createRun(2026);
    expect(totalCards(run)).toBe(8);
    for (let i = 0; i < 3; i++) {
      run = endTurn(run);
      expect(totalCards(run)).toBe(8);
      expect([...run.hand, ...run.drawPile, ...run.discardPile].sort()).toEqual(
        [...STARTER_DECK].sort(),
      );
    }
    expect(run.turn).toBe(4);
  });

  it("세 턴을 돌리면 버림 더미가 섞여 뽑기 더미로 되돌아온다", () => {
    let run = createRun(2026);
    for (let i = 0; i < 3; i++) run = endTurn(run);
    // 여덟 장 덱에서 매 턴 다섯 장을 뽑으니 되돌리기 없이는 손패가 채워지지 않는다.
    expect(run.hand).toHaveLength(5);
    expect(run.drawPile).toHaveLength(3);
    expect(run.discardPile).toHaveLength(0);
  });
});

// endTurn — 결말과 멈춤.
describe("endTurn — 결말", () => {
  it("플레이어 hp 가 0 이하가 되면 lost 다", () => {
    const state = makeRun({
      player: { hp: 5, block: 0, energy: 1 },
      enemy: { hp: 40, moves: [{ kind: "attack", amount: 8 }], moveIndex: 0 },
    });
    const next = endTurn(state);
    expect(next.player.hp).toBe(-3);
    expect(next.outcome).toBe("lost");
  });

  it("hp 가 정확히 0 이어도 lost 다", () => {
    const state = makeRun({
      player: { hp: 8, block: 0, energy: 1 },
      enemy: { hp: 40, moves: [{ kind: "attack", amount: 8 }], moveIndex: 0 },
    });
    const next = endTurn(state);
    expect(next.player.hp).toBe(0);
    expect(next.outcome).toBe("lost");
  });

  it("졌으면 거기서 멈춘다 — 턴도 기력도 moveIndex 도 그대로고 새로 뽑지 않는다", () => {
    const state = makeRun({
      hand: ["jab"],
      drawPile: ["guard", "strike", "flurry", "brace", "sidestep"],
      player: { hp: 5, block: 0, energy: 1 },
      enemy: { hp: 40, moves: [{ kind: "attack", amount: 8 }, { kind: "attack", amount: 12 }], moveIndex: 0 },
      turn: 3,
    });
    const next = endTurn(state);
    expect(next.turn).toBe(3);
    expect(next.player.energy).toBe(1);
    expect(next.enemy.moveIndex).toBe(0);
    expect(next.hand).toEqual([]);
    expect(next.drawPile).toEqual(["guard", "strike", "flurry", "brace", "sidestep"]);
  });

  it("방어도가 피해를 다 막으면 지지 않는다", () => {
    const state = makeRun({
      player: { hp: 1, block: 8, energy: 0 },
      enemy: { hp: 40, moves: [{ kind: "attack", amount: 8 }], moveIndex: 0 },
    });
    const next = endTurn(state);
    expect(next.player.hp).toBe(1);
    expect(next.outcome).toBe("ongoing");
  });

  it("결말이 won 이면 상태를 그대로 돌려준다", () => {
    const state = makeRun({ hand: ["jab"], outcome: "won" });
    expect(endTurn(state)).toEqual(state);
  });

  it("결말이 lost 면 상태를 그대로 돌려준다", () => {
    const state = makeRun({ hand: ["jab"], outcome: "lost" });
    expect(endTurn(state)).toEqual(state);
  });
});

// endTurn — 입력을 건드리지 않는다.
describe("endTurn — 되돌리기", () => {
  it("입력 상태를 변형하지 않는다", () => {
    const state = makeRun({
      hand: ["jab", "guard"],
      drawPile: ["strike", "flurry"],
      discardPile: ["brace"],
      player: { hp: 50, block: 5, energy: 1 },
    });
    const snapshot = structuredClone(state);
    endTurn(state);
    expect(state).toEqual(snapshot);
  });

  it("얼린 상태를 넘겨도 터지지 않는다", () => {
    const state = deepFreeze(
      makeRun({ hand: ["jab"], drawPile: ["guard", "strike"], discardPile: ["brace"] }),
    );
    expect(() => endTurn(state)).not.toThrow();
  });

  it("돌려준 상태는 입력과 배열을 공유하지 않는다", () => {
    const state = makeRun({ hand: ["jab"], drawPile: ["guard", "strike"] });
    const next = endTurn(state);
    expect(next.hand).not.toBe(state.hand);
    expect(next.drawPile).not.toBe(state.drawPile);
    expect(next.discardPile).not.toBe(state.discardPile);
  });

  it("여러 턴을 지나도 JSON 을 건널 수 있는 평범한 값만 남는다", () => {
    let run = createRun(7);
    for (let i = 0; i < 3; i++) run = endTurn(run);
    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
  });
});
