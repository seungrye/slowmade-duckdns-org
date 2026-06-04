// 18 정적 ts 씬 → mongo `webadventurescenes` 컬렉션 upsert 마이그레이션.
//
// 사용:
//   node --env-file=.env.local scripts/migrate-web-adventure-scenes.mjs
//   node --env-file=.env.local scripts/migrate-web-adventure-scenes.mjs --dry-run
//
// 동작:
//   1. .env.local 의 MONGO_URI 로 직접 연결.
//   2. src/lib/web-adventure/engine/sceneRegistry.ts 를 jiti 로 동적 로드 →
//      18 개 Scene 객체.
//   3. src/lib/web-adventure/migrate-scenes.ts 의 buildSceneDocs 로 변환.
//   4. id 기준 upsert (멱등). 변경된 경우만 update 카운트.
//
// 보고: insert N / update M / skip K (== unchanged).

import path from "node:path";
import fs from "node:fs";
import url from "node:url";

const __filename0 = url.fileURLToPath(import.meta.url);
const __dirname0 = path.dirname(__filename0);
const webappRoot = path.resolve(__dirname0, "..");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

// node --env-file=.env.local 이 환경변수를 채워주므로 별도 파싱 불필요.
// fallback: .env.local 수동 로드.
if (!process.env.MONGO_URI) {
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
}

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI 가 설정되지 않았습니다 (.env.local 확인).");
  process.exit(1);
}

// ── jiti 로 TS 모듈 동적 로드 ────────────────────────────────────────────
const jitiEntry = path.resolve(
  webappRoot,
  "node_modules/.pnpm/jiti@2.7.0/node_modules/jiti/lib/jiti.mjs",
);
const { createJiti } = await import(url.pathToFileURL(jitiEntry).href);
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(webappRoot, "src") },
  cache: true,
});

const sceneRegistry = await jiti.import(
  path.join(webappRoot, "src/lib/web-adventure/engine/sceneRegistry.ts"),
);
const migrateScenes = await jiti.import(
  path.join(webappRoot, "src/lib/web-adventure/migrate-scenes.ts"),
);
const mongooseMod = await jiti.import("mongoose");
const mongoose = mongooseMod.default ?? mongooseMod;

async function loadDefault(rel) {
  const mod = await jiti.import(path.join(webappRoot, rel));
  return mod.default ?? mod;
}
const WebAdventureScene = await loadDefault("src/models/web-adventure-scene.tsx");

// ── 정적 씬 로드 + payload 변환 ─────────────────────────────────────────
const staticScenes = Object.values(sceneRegistry.scenes);
const docs = migrateScenes.buildSceneDocs(staticScenes);

console.log(`[migrate-scenes] 정적 씬 ${docs.length} 개 로드 (DRY_RUN=${DRY_RUN}).`);

// ── 변경 감지 (안정 비교) ───────────────────────────────────────────────
function normalize(obj) {
  // mongoose lean / new doc 의 차이 무시.
  // Map → object 정규화.
  if (obj instanceof Map) return Object.fromEntries(obj);
  if (Array.isArray(obj)) return obj.map(normalize);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const k of Object.keys(obj).sort()) {
      if (k === "_id" || k === "__v" || k === "createdAt" || k === "updatedAt") continue;
      out[k] = normalize(obj[k]);
    }
    return out;
  }
  return obj;
}

function sameContent(existing, payload) {
  const e = normalize(existing);
  const p = normalize(payload);
  // existing 은 _id/__v/timestamps 제외 + Map 정규화. payload 는 그대로 비교.
  return JSON.stringify(e) === JSON.stringify(p);
}

// ── 실행 ───────────────────────────────────────────────────────────────
let inserted = 0;
let updated = 0;
let unchanged = 0;

try {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("[migrate-scenes] MongoDB 연결 OK.");

  for (const payload of docs) {
    const existing = await WebAdventureScene.findOne({ id: payload.id }).lean();
    if (!existing) {
      if (!DRY_RUN) await WebAdventureScene.create(payload);
      inserted++;
      console.log(`  [insert] ${payload.id}`);
    } else if (!sameContent(existing, payload)) {
      if (!DRY_RUN) {
        await WebAdventureScene.updateOne(
          { id: payload.id },
          { $set: payload },
          { runValidators: true },
        );
      }
      updated++;
      console.log(`  [update] ${payload.id}`);
    } else {
      unchanged++;
    }
  }

  console.log("");
  console.log(`[migrate-scenes] 결과: insert ${inserted} / update ${updated} / skip ${unchanged}`);
  console.log(`[migrate-scenes] DRY_RUN=${DRY_RUN}`);
} catch (e) {
  console.error("[migrate-scenes] 에러:", e);
  process.exit(1);
} finally {
  await mongoose.disconnect();
}
