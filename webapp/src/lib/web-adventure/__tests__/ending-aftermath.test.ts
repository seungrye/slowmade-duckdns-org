// #275 엔딩 후일담 — 각 ending 씬 본문이 3 줄 이상 (full epilogue + 후일담).
// 후일담은 *— 으로 시작하는 줄* 로 끝맺는다 (시각 분리).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Scene, SceneRegistry } from "@/types/web-adventure";

// #327 — ending_petrification 씬은 *reducer 자동 ending* 잔재로 삭제됨.
//   EndingScreen 이 endingsMeta 만 사용하므로 씬 데이터 불필요.
const ENDING_IDS = [
  "ending_ascension",
  "ending_revolution",
  "ending_harmony",
  "ending_fall",
  "ending_sylvan_bond",
];

let loaded: SceneRegistry | null = null;

beforeAll(async () => {
  if (!process.env.MONGO_URI) return;
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    "AftermathCheck",
    new mongoose.Schema({}, { strict: false, collection: "webadventurescenes" }),
  );
  const all = (await Scene.find({}).lean()) as unknown as Scene[];
  const r: SceneRegistry = {};
  for (const s of all) r[s.id] = s;
  loaded = r;
  await mongoose.disconnect();
});

afterAll(() => { loaded = null; });

describe("엔딩 후일담 (#275)", () => {
  it.each(ENDING_IDS)("%s 본문 ≥ 3 줄 (full epilogue + 후일담)", (id) => {
    if (!loaded) return;
    const s = loaded[id];
    expect(s).toBeTruthy();
    expect(s.body.length).toBeGreaterThanOrEqual(3);
  });

  it.each(ENDING_IDS)("%s 의 마지막 줄이 *—* 으로 시작 (후일담 분리)", (id) => {
    if (!loaded) return;
    const s = loaded[id];
    const last = s.body[s.body.length - 1];
    expect(last.startsWith("—")).toBe(true);
  });
});
