// #278 사이드 NPC 이름 부여 — 지정 씬에 NPC 이름이 본문에 포함됨.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Scene, SceneRegistry } from "@/types/web-adventure";

const NPC_NAMES: Record<string, string> = {
  kael_infirmary: "벤딕트 박사",
  rin_betrayal: "호프만 수사관장",
  omphalos_blackmarket: "그라모르",
  solwen_grief: "흰눈",
  kael_corridor_clear: "마릭 영감",
};

let loaded: SceneRegistry | null = null;

beforeAll(async () => {
  if (!process.env.MONGO_URI) return;
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    "NpcCheck",
    new mongoose.Schema({}, { strict: false, collection: "webadventurescenes" }),
  );
  const all = (await Scene.find({}).lean()) as unknown as Scene[];
  const r: SceneRegistry = {};
  for (const s of all) r[s.id] = s;
  loaded = r;
  await mongoose.disconnect();
});

afterAll(() => { loaded = null; });

describe("NPC 이름 (#278)", () => {
  it.each(Object.entries(NPC_NAMES))("%s 본문에 %s 이름 포함", (sceneId, name) => {
    if (!loaded) return;
    const scene = loaded[sceneId];
    expect(scene).toBeTruthy();
    const joined = (scene.body ?? []).join(" ");
    expect(joined, `${name} 누락`).toContain(name);
  });
});
