// The migration upserting the 18 static ts scenes into mongo's `webadventurescenes` collection.
//
// Usage:
//   node --env-file=.env.local scripts/migrate-web-adventure-scenes.mjs
//   node --env-file=.env.local scripts/migrate-web-adventure-scenes.mjs --dry-run
//
// How it works:
//   1. connects directly with .env.local's MONGO_URI.
//   2. src/lib/web-adventure/engine/sceneRegistry.ts is loaded dynamically through jiti ->
//      the 18 Scene objects.
//   3. converted by buildSceneDocs in src/lib/web-adventure/migrate-scenes.ts.
//   4. upserted by id (idempotent). Only a changed document counts as an update.
//
// The report: insert N / update M / skip K (== unchanged).

import path from "node:path";
import fs from "node:fs";
import url from "node:url";

const __filename0 = url.fileURLToPath(import.meta.url);
const __dirname0 = path.dirname(__filename0);
const webappRoot = path.resolve(__dirname0, "..");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

// node --env-file=.env.local fills the environment variables in, so no separate parsing is needed.
// The fallback: loading .env.local by hand.
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

// -- loading the TS modules dynamically through jiti ------------------------
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

// -- loading the static scenes and converting the payload -------------------
const staticScenes = Object.values(sceneRegistry.scenes);
const docs = migrateScenes.buildSceneDocs(staticScenes);

console.log(`[migrate-scenes] 정적 씬 ${docs.length} 개 로드 (DRY_RUN=${DRY_RUN}).`);

// -- change detection (a stable comparison) ---------------------------------
function normalize(obj) {
  // Ignoring the difference between a mongoose lean result and a new doc.
  // Map -> object normalisation.
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
  // existing drops _id/__v/timestamps and normalises Maps. payload is compared as it is.
  return JSON.stringify(e) === JSON.stringify(p);
}

// -- running ----------------------------------------------------------------
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
