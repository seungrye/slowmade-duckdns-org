// #286 모든 conditional 분기 도달성 — vitest 통합.
//
// 검증:
//   1. 각 conditional choice 의 씬이 BFS 도달 가능 (시작 씬 3 종에서).
//   2. 각 condition flag 가 *어딘가에서* set 가능:
//      - world.* → 6 ending 모두 도달 가능 (반대 검증으로 가정)
//      - 일반 flag → onEnter.setFlags 또는 onEnter (해당 씬 도달 가능 보장 후)
//   3. minStat → 최소 1 주인공 통과 가능.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Choice, Scene, SceneRegistry } from "@/types/web-adventure";
import { protagonists } from "@/content/web-adventure/protagonists";
import { ENDING_TO_WORLD_FLAG } from "../world-flags";

let loaded: SceneRegistry | null = null;

beforeAll(async () => {
  if (!process.env.MONGO_URI) return;
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model(
    "BranchReachability",
    new mongoose.Schema({}, { strict: false, collection: "webadventurescenes" }),
  );
  const all = (await Scene.find({}).lean()) as unknown as Scene[];
  const r: SceneRegistry = {};
  for (const s of all) r[s.id] = s;
  loaded = r;
  await mongoose.disconnect();
});

afterAll(() => { loaded = null; });

function collectTargets(scene: Scene): string[] {
  const t: string[] = [];
  for (const c of scene.choices ?? []) {
    const ch = c as Record<string, unknown>;
    if (typeof ch.to === "string") t.push(ch.to);
    if (typeof ch.onSuccess === "string") t.push(ch.onSuccess as string);
    if (typeof ch.onFailure === "string") t.push(ch.onFailure as string);
  }
  return t;
}

function bfs(registry: SceneRegistry, roots: string[]): Set<string> {
  const visited = new Set<string>();
  const q = [...roots];
  while (q.length) {
    const id = q.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const s = registry[id];
    if (!s) continue;
    for (const t of collectTargets(s)) if (!visited.has(t)) q.push(t);
  }
  return visited;
}

interface ConditionalRef {
  sceneId: string;
  choiceId: string;
  condition: { kind: string; key?: string; stat?: string; min?: number };
}

function collectConditionals(registry: SceneRegistry): ConditionalRef[] {
  const out: ConditionalRef[] = [];
  for (const [id, s] of Object.entries(registry)) {
    for (const c of s.choices ?? []) {
      const ch = c as Choice & { condition?: { kind: string; key?: string; stat?: string; min?: number } };
      if (ch.kind === "conditional" && ch.condition) {
        out.push({ sceneId: id, choiceId: ch.id, condition: ch.condition });
      }
    }
  }
  return out;
}

describe("분기 도달성 (#286)", () => {
  it("모든 conditional 분기의 씬이 BFS 도달 가능", () => {
    if (!loaded) return;
    const starts = Object.values(protagonists).map((p) => p.startScene);
    const reachable = bfs(loaded, starts);
    const conds = collectConditionals(loaded);
    const unreachable = conds.filter((c) => !reachable.has(c.sceneId));
    expect(
      unreachable,
      `씬 미도달 conditional: ${unreachable.map((c) => `${c.sceneId}/${c.choiceId}`).join(", ")}`,
    ).toEqual([]);
  });

  it("일반 flag conditional — 각 flag 가 onEnter.setFlags 어딘가에서 set", () => {
    if (!loaded) return;
    const conds = collectConditionals(loaded);
    const setterKeys = new Set<string>();
    for (const s of Object.values(loaded)) {
      for (const k of Object.keys(s.onEnter?.setFlags ?? {})) setterKeys.add(k);
      // #89 — 선택지도 흔적을 남긴다. 도착 씬이 같은 갈래는 onEnter 로 구분할 수 없어
      //   선택지 자체에 setFlags 를 달았으므로, 여기서도 setter 로 인정해야 한다.
      for (const c of s.choices ?? []) {
        const cf = (c as { setFlags?: Record<string, boolean> }).setFlags;
        for (const k of Object.keys(cf ?? {})) setterKeys.add(k);
      }
    }
    const missing: string[] = [];
    for (const c of conds) {
      if (c.condition.kind !== "flag" || !c.condition.key) continue;
      if (c.condition.key.startsWith("world.")) continue; // 회차 부메랑 — 별 검증.
      if (!setterKeys.has(c.condition.key)) {
        missing.push(`${c.sceneId}/${c.choiceId} — ${c.condition.key} setter 없음`);
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("회차 부메랑 — ENDING_TO_WORLD_FLAG 의 모든 6 flag 가 어떤 분기에서 활용", () => {
    if (!loaded) return;
    const conds = collectConditionals(loaded);
    const usedFlags = new Set<string>();
    for (const c of conds) {
      if (c.condition.kind === "flag" && c.condition.key?.startsWith("world.")) {
        usedFlags.add(c.condition.key);
      }
    }
    const allWorldFlags = Object.values(ENDING_TO_WORLD_FLAG);
    const unused = allWorldFlags.filter((f) => !usedFlags.has(f));
    expect(unused, `미사용 world flag: ${unused.join(", ")}`).toEqual([]);
  });

  it("minStat conditional — 최소 1 주인공이 통과 가능", () => {
    if (!loaded) return;
    const conds = collectConditionals(loaded);
    const STAT_ALIAS = { str: "str", dex: "dex", int: "int", cha: "cha", con: "con", wis: "wis" } as const;
    type S = keyof typeof STAT_ALIAS;
    const unmatched: string[] = [];
    for (const c of conds) {
      if (c.condition.kind !== "minStat" || !c.condition.stat || c.condition.min == null) continue;
      const stat = c.condition.stat as S;
      const min = c.condition.min;
      const passing = Object.entries(protagonists).filter(
        ([, p]) => (p.baseStats[STAT_ALIAS[stat]] ?? 0) >= min,
      );
      if (passing.length === 0) {
        unmatched.push(`${c.sceneId}/${c.choiceId} ${stat} ≥ ${min} — 통과 주인공 0`);
      }
    }
    expect(unmatched, unmatched.join("\n")).toEqual([]);
  });
});
