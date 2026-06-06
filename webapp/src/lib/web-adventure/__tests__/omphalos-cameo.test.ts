// #274 옴팔로스 카메오 씬 — 다른 주인공 마주침 (sawOtherProtagonist hidden 해금).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Scene, SceneRegistry, Choice } from "@/types/web-adventure";

let loaded: SceneRegistry | null = null;

beforeAll(async () => {
  if (!process.env.MONGO_URI) return;
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    "CameoCheck",
    new mongoose.Schema({}, { strict: false, collection: "webadventurescenes" }),
  );
  const all = (await Scene.find({}).lean()) as unknown as Scene[];
  const r: SceneRegistry = {};
  for (const s of all) r[s.id] = s;
  loaded = r;
  await mongoose.disconnect();
});

afterAll(() => {
  loaded = null;
});

describe("omphalos_cameo (#274)", () => {
  it("omphalos_cameo 씬이 존재하고 3 분기 (설득/교환/외면)", () => {
    if (!loaded) return;
    const s = loaded["omphalos_cameo"];
    expect(s).toBeTruthy();
    expect(s.choices.length).toBe(3);
    const ids = s.choices.map((c: Choice) => c.id);
    // #321 — walk_past plain → hecate_illusion ability conditional 로 교체.
    expect(ids).toEqual(expect.arrayContaining(["persuade_join", "exchange_intel", "hecate_illusion"]));
  });

  it("3 분기 모두 omphalos_station 으로 합류", () => {
    if (!loaded) return;
    const s = loaded["omphalos_cameo"];
    for (const c of s.choices) {
      const targets: string[] = [];
      const ch = c as Choice & { to?: string; onSuccess?: string; onFailure?: string };
      if (ch.to) targets.push(ch.to);
      if (ch.onSuccess) targets.push(ch.onSuccess);
      if (ch.onFailure) targets.push(ch.onFailure);
      for (const t of targets) expect(t).toBe("omphalos_station");
    }
  });

  it("omphalos_blackmarket 의 meet_cameo hidden 분기가 sawOtherProtagonist 검사", () => {
    if (!loaded) return;
    const bm = loaded["omphalos_blackmarket"];
    const cameo = bm.choices.find((c: Choice) => c.id === "meet_cameo");
    expect(cameo).toBeTruthy();
    if (!cameo || cameo.kind !== "conditional") throw new Error("meet_cameo 조건 분기 아님");
    expect(cameo.condition).toEqual({ kind: "flag", key: "sawOtherProtagonist" });
    expect(cameo.hidden).toBe(true);
    expect(cameo.to).toBe("omphalos_cameo");
  });

  it("blackmarket 분기 수가 3 이하 유지", () => {
    if (!loaded) return;
    expect(loaded["omphalos_blackmarket"].choices.length).toBeLessThanOrEqual(3);
  });

  it("cameo 진입 시 onEnter.stigmaDelta = 1 (마력 표식 공명)", () => {
    if (!loaded) return;
    expect(loaded["omphalos_cameo"].onEnter?.stigmaDelta).toBe(1);
  });
});
