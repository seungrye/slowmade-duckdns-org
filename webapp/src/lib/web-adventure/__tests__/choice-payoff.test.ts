// #107 — 남긴 흔적(flag)이 이야기에서 회수되는지.
//
// #89 에서 선택마다 flag 를 남겼고, 여기서 그것을 받는 길이 실제로 열리는지 본다.
// 화면 선택지는 셋을 넘지 않아야 하므로(#262) 기존 판정 자리를 hideWhenFlag 로 비우고
// 그 자리에 조건부를 넣었다 — 그 맞바꿈이 성립하는지도 함께 확인한다.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isChoiceVisible } from "@/lib/web-adventure/engine/choiceFilter";
import type { Character, Choice } from "@/types/web-adventure";
import mongoose from "mongoose";

const NEW_IDS = ["cameo_ally_lever", "tunnel_debt_backdoor", "press_leverage"];

/** [씬, 그 씬에서 회수하는 흔적] */
const CASES: Array<[string, string]> = [
  ["station_path_steel", "cameoAlly"],
  ["omphalos_infiltration", "tunnelDebt"],
  ["rin_betrayal", "leakedToPress"],
];

const char = (flags: Record<string, boolean>): Character => ({
  stats: { str: 5, dex: 5, int: 5, cha: 5, con: 5, wis: 5 },
  hp: 10, maxHp: 10, ability: "lunar", protagonist: "kael",
  stigmaErosion: 0, inventory: [], flags, rerollsLeft: 0,
});

let scenes: Record<string, Choice[]> | null = null;

beforeAll(async () => {
  if (!process.env.MONGO_URI) return;
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.db!.collection("webadventurescenes");
  scenes = {};
  for (const [id] of CASES) {
    const doc = await col.findOne({ id });
    if (doc) scenes[id] = doc.choices as unknown as Choice[];
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
});

describe("흔적 회수 (#107)", () => {
  it("흔적이 없으면 새 길이 보이지 않는다", () => {
    if (!scenes) return;
    for (const [id] of CASES) {
      const visible = (scenes[id] ?? []).filter((c) => isChoiceVisible(c, char({})));
      expect(visible.some((c) => NEW_IDS.includes(c.id)), `${id}`).toBe(false);
    }
  });

  it("흔적이 있으면 새 길이 열린다", () => {
    if (!scenes) return;
    for (const [id, flag] of CASES) {
      const visible = (scenes[id] ?? []).filter((c) => isChoiceVisible(c, char({ [flag]: true })));
      expect(visible.some((c) => NEW_IDS.includes(c.id)), `${id} / ${flag}`).toBe(true);
    }
  });

  // 자리를 맞바꾸는 것이지 늘리는 것이 아니다.
  it("어느 경우에도 화면 선택지는 셋을 넘지 않고, 갈 곳이 있다", () => {
    if (!scenes) return;
    for (const [id, flag] of CASES) {
      const without = (scenes[id] ?? []).filter((c) => isChoiceVisible(c, char({})));
      const withFlag = (scenes[id] ?? []).filter((c) => isChoiceVisible(c, char({ [flag]: true })));
      expect(without.length, `${id} 없을 때`).toBeGreaterThan(0);
      expect(without.length, `${id} 없을 때`).toBeLessThanOrEqual(3);
      expect(withFlag.length, `${id} 있을 때`).toBeGreaterThan(0);
      expect(withFlag.length, `${id} 있을 때`).toBeLessThanOrEqual(3);
    }
  });
});
