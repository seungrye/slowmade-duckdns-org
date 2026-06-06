// #284 스토리 흐름 균형 — act1 본문 + Kael 라인 환경 침식.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Scene, SceneRegistry } from "@/types/web-adventure";

let loaded: SceneRegistry | null = null;

beforeAll(async () => {
  if (!process.env.MONGO_URI) return;
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    "FlowBalance",
    new mongoose.Schema({}, { strict: false, collection: "webadventurescenes" }),
  );
  const all = (await Scene.find({}).lean()) as unknown as Scene[];
  const r: SceneRegistry = {};
  for (const s of all) r[s.id] = s;
  loaded = r;
  await mongoose.disconnect();
});

afterAll(() => { loaded = null; });

describe("act1 본문 균질화 (#284)", () => {
  it("3 주인공 시작 씬 본문 ≥ 5 줄 (Kael 6 과 균형)", () => {
    if (!loaded) return;
    for (const id of ["kael_infirmary", "rin_harbor", "solwen_grove"]) {
      expect(loaded[id].body.length, `${id} body 너무 짧음`).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("Kael 라인 환경 침식 (#284)", () => {
  it.each([
    ["kael_corridor", 1],
    ["kael_cargo_container", 1],
    ["kael_falling", 1],
  ])("%s 의 onEnter.stigmaDelta = %i", (id, expected) => {
    if (!loaded) return;
    expect(loaded[id as string].onEnter?.stigmaDelta).toBe(expected);
  });
});
