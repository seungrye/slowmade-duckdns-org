// #305 automatically verifying that the seeds are idempotent.
//
// Every seed in seeds-replay.sh must leave mongo's state *unchanged* when *run twice in a row*
// (idempotent). It prevents a recurrence of incidents like #304's seed-npc-dialogue body-append leak.
// leak.
//
// A real mongo backup -> replay -> a new backup -> a diff of the meaningful fields (== 0).

import { describe, it, expect } from "vitest";
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

    // The first replay (the current state -> stabilised).
    execSync(REPLAY_SCRIPT, { env: { ...process.env }, stdio: "pipe" });
    const before = await snapshot();

    // The second replay - *no change* is what is correct.
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
