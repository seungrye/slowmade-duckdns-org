// #305 시드 idempotent 자동 검증.
//
// seeds-replay.sh 의 모든 시드는 *2 회 연속 실행 시* mongo 상태가 *변경 없어야*
// 한다 (idempotent). #304 의 seed-npc-dialogue body append 누수 같은 사고 재발
// 방지.
//
// 실 mongo 백업 → replay → 새 백업 → 의미있는 필드 diff (== 0).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import { resolve } from "path";

const ROOT = resolve(process.cwd());
const REPLAY_SCRIPT = resolve(ROOT, "scripts/seeds-replay.sh");

interface SceneSnapshot {
  id: string;
  [k: string]: unknown;
}

function cleanSnapshot(s: SceneSnapshot): SceneSnapshot {
  const c: SceneSnapshot = { ...s };
  delete c._id;
  delete c.__v;
  delete c.updatedAt;
  delete c.createdAt;
  return c;
}

async function snapshot(): Promise<Map<string, string>> {
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(process.env.MONGO_URI!);
  const Scene =
    mongoose.models.IdempotencyCheck ??
    mongoose.model(
      "IdempotencyCheck",
      new mongoose.Schema({}, { strict: false, collection: "webadventurescenes" }),
    );
  const all = (await Scene.find({}).lean()) as unknown as SceneSnapshot[];
  await mongoose.disconnect();
  const map = new Map<string, string>();
  for (const s of all) map.set(s.id, JSON.stringify(cleanSnapshot(s)));
  return map;
}

describe("시드 idempotency (#305)", () => {
  it("seeds-replay.sh 2회 연속 → mongo 상태 변경 없음", async () => {
    if (!process.env.MONGO_URI) {
      console.warn("MONGO_URI 없음 — skip");
      return;
    }

    // 1차 replay (현재 상태 → 안정화).
    execSync(REPLAY_SCRIPT, { env: { ...process.env }, stdio: "pipe" });
    const before = await snapshot();

    // 2차 replay — *변경 없어야* 정상.
    execSync(REPLAY_SCRIPT, { env: { ...process.env }, stdio: "pipe" });
    const after = await snapshot();

    expect(before.size).toBe(after.size);
    const differs: string[] = [];
    for (const [id, beforeJson] of before) {
      const afterJson = after.get(id);
      if (beforeJson !== afterJson) {
        differs.push(id);
      }
    }
    expect(differs, `idempotent 위반: ${differs.join(", ")}`).toEqual([]);
  }, 120000);
});
