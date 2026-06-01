// One-off: elder_tintham_quest 의 failed → accepted Interact transition 에
// SpawnItem 액션을 추가한다 — 잠입 실패 후 재시도 시 졸라크래커 재 spawn.
//
// 사용:
//   node scripts/update-elder-tintham-spawnitem.mjs --dry-run
//   node scripts/update-elder-tintham-spawnitem.mjs
//
// 회귀 방지:
//   - 이미 SpawnItem 액션이 있으면 idempotent (no-op).
//   - failed → accepted transition 이 없으면 경고하고 skip (다른 형태일 수 있음).

import path from "node:path";
import fs from "node:fs";
import url from "node:url";

const __filename0 = url.fileURLToPath(import.meta.url);
const __dirname0 = path.dirname(__filename0);
const jitiEntry = path.resolve(
  __dirname0,
  "..",
  "node_modules/.pnpm/jiti@2.7.0/node_modules/jiti/lib/jiti.mjs",
);
const { createJiti } = await import(url.pathToFileURL(jitiEntry).href);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const webappRoot = path.resolve(__dirname0, "..");
const envPath = path.join(webappRoot, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
}
if (!process.env.MONGO_URI) {
  console.error("MONGO_URI 가 .env.local 에 없습니다.");
  process.exit(1);
}

const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(webappRoot, "src") },
  cache: true,
});

const mongooseMod = await jiti.import("mongoose");
const mongoose = mongooseMod.default ?? mongooseMod;

async function loadDefault(rel) {
  const mod = await jiti.import(path.join(webappRoot, rel));
  return mod.default ?? mod;
}

const Quest = await loadDefault("src/models/quest.tsx");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const quest = await Quest.findOne({ id: "elder_tintham_quest" }).lean();
    if (!quest) {
      console.error("elder_tintham_quest 가 DB 에 없습니다. 먼저 base quest 를 생성하세요.");
      return;
    }

    console.log(`현재 transitions 수: ${quest.transitions?.length ?? 0}`);

    const transitions = [...(quest.transitions ?? [])];
    const idx = transitions.findIndex(
      (t) => t.from === "failed" && t.to === "accepted" && t.trigger === "Interact",
    );

    const newSpawnItemAction = {
      type: "SpawnItem",
      itemId: "super_tintham_cracker",
      landmark: "market",
      vendorDistanceMin: 2,
      count: 1,
    };

    if (idx < 0) {
      console.log("failed → accepted Interact transition 미존재 — 새로 추가합니다.");
      transitions.push({
        from: "failed",
        trigger: "Interact",
        actions: [newSpawnItemAction, { type: "Log", text: "다시 시도하지... 이번엔 들키지 말게." }],
        to: "accepted",
      });
    } else {
      const t = transitions[idx];
      const actions = [...(t.actions ?? [])];
      const has = actions.some(
        (a) => a?.type === "SpawnItem" && a?.itemId === "super_tintham_cracker",
      );
      if (has) {
        console.log("이미 SpawnItem 액션이 있습니다 — idempotent skip.");
        return;
      }
      actions.unshift(newSpawnItemAction);
      transitions[idx] = { ...t, actions };
      console.log("기존 failed → accepted Interact transition 의 actions 에 SpawnItem 을 prepend.");
    }

    if (DRY_RUN) {
      console.log("[dry-run] transitions:", JSON.stringify(transitions, null, 2));
    } else {
      const res = await Quest.updateOne(
        { id: "elder_tintham_quest" },
        { $set: { transitions, updatedAt: new Date() }, $inc: { version: 1 } },
      );
      console.log("modifiedCount:", res.modifiedCount);
      console.log("matchedCount:", res.matchedCount);
    }
  } finally {
    await mongoose.disconnect();
  }
}

await run();
