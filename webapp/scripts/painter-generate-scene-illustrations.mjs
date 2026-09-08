// #227 - generating painter-bot illustrations automatically for Web Adventure's 25 new scenes.
//
// Usage:
//   node --env-file=.env.local scripts/painter-generate-scene-illustrations.mjs
//   node --env-file=.env.local scripts/painter-generate-scene-illustrations.mjs --dry-run
//   node --env-file=.env.local scripts/painter-generate-scene-illustrations.mjs --only=cave_inside,goblin_encounter
//
// How it works:
//   1. connects directly with .env.local's MONGO_URI.
//   2. fetches the 25 scenes (KEEP_IDS excluded) from webadventurescenes.
//   3. per scene:
//      a) Gemini turns the body text into a *visual pixel-art prompt* (in Korean) automatically.
//      b) translateAndGenerate (Gemini Korean->English + Pollinations FLUX + a MinIO upload).
//      c) painter's daily quota +1 (checked against the 50/day limit).
//      d) Scene.illustration is updated to the MinIO URL.
//      e) an ATTRIBUTION entry is accumulated.
//   4. ATTRIBUTION.md's painter-bot section is updated (the existing 5 plus the new 25).
//   5. a summary is reported.
//
// The safeguards:
//   - avoiding Pollinations' rate limit - sequential calls with a 2-second sleep between them.
//   - stopping at once when the quota is exceeded.
//   - --dry-run: 0 external calls, 0 mongo writes - it prints the prompts alone.
//   - the existing 5 representative scenes (KEEP_IDS) are never touched.

import path from "node:path";
import fs from "node:fs";
import url from "node:url";

const __filename0 = url.fileURLToPath(import.meta.url);
const __dirname0 = path.dirname(__filename0);
const webappRoot = path.resolve(__dirname0, "..");
const siteRoot = path.resolve(webappRoot, "..");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ALL = args.includes("--all"); // Ignores the placeholders and regenerates every scene.
// The number of variations per scene (seed variants). 3 by default.
const VARIATIONS = parseInt(process.env.PAINTER_VARIATIONS ?? "3", 10);
// The sleep between variations (ms). Easing the load on Pollinations. 3 seconds by default.
const BETWEEN_VARIATIONS_MS = parseInt(process.env.PAINTER_BETWEEN_VARIATIONS_MS ?? "3000", 10);
const ONLY_ARG = args.find((a) => a.startsWith("--only="));
const ONLY_IDS = ONLY_ARG ? ONLY_ARG.slice("--only=".length).split(",").filter(Boolean) : null;
const PROMPT_CACHE_ARG = args.find((a) => a.startsWith("--prompt-cache="));
const PROMPT_CACHE_PATH = PROMPT_CACHE_ARG ? PROMPT_CACHE_ARG.slice("--prompt-cache=".length) : null;
const EN_OVERRIDE_ARG = args.find((a) => a.startsWith("--english-overrides="));
const EN_OVERRIDE_PATH = EN_OVERRIDE_ARG ? EN_OVERRIDE_ARG.slice("--english-overrides=".length) : null;

// The existing 5 representative scenes - their images are kept and never touched.
// #253 The Fall of Eternia - every old scene is gone. KEEP_IDS is emptied.
const KEEP_IDS = new Set([]);

// Eternia's 30 + 1 scenes - Kael's act 1 / Rin's act 1 / Solwen's act 1 / Omphalos acts 2-3 / the 6 endings.
const TARGET_IDS = [
  // Kael's act 1
  "kael_infirmary",
  "kael_corridor",
  "kael_corridor_clear",
  "kael_cargo_container",
  "kael_falling",
  "kael_caught",
  // Rin's act 1 - rin_chase and rin_caught were deleted in #328's dead-orphan cleanup.
  "rin_harbor",
  "rin_evidence",
  "rin_betrayal",
  "rin_underground",
  // Solwen's act 1
  "solwen_grove",
  "solwen_combat",
  "solwen_combat_hard",
  "solwen_grief",
  "solwen_departure",
  // joining Omphalos
  "omphalos_outskirts",
  "omphalos_blackmarket",
  "omphalos_station",
  // the climax
  "climax_harmony_path",
  "climax_revolution_path",
  "climax_sylvan_path",
  "climax_ascension_path",
  "climax_fall_path",
  // The 5 endings - ending_petrification was deleted in #327 (an automatic ending, using no scene data).
  "ending_ascension",
  "ending_revolution",
  "ending_harmony",
  "ending_fall",
  "ending_sylvan_bond",
];

// #253 The Fall of Eternia - a dark epic fantasy tone (celestial magitech).
const STYLE_SUFFIX = "다크 에픽 판타지, 강철과 증기, 천체 마법공학, 차가운 푸른 빛, 검은 연기, 16비트 RPG 도트 픽셀 아트, 인물 없음";

// The env fallback load (for cases not using node --env-file)
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

for (const k of ["MONGO_URI", "MINIO_ENDPOINT", "MINIO_ACCESSKEY", "MINIO_SECRETKEY", "MINIO_BUCKET", "GEMINI_API_KEY"]) {
  if (!process.env[k]) {
    console.error(`[painter-scenes] 필수 환경변수 누락: ${k}`);
    process.exit(1);
  }
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

const mongooseMod = await jiti.import("mongoose");
const mongoose = mongooseMod.default ?? mongooseMod;
const Minio = await jiti.import("minio");
const geminiMod = await jiti.import("@google/genai");
const GoogleGenAI = geminiMod.GoogleGenAI;

async function loadDefault(rel) {
  const mod = await jiti.import(path.join(webappRoot, rel));
  return mod.default ?? mod;
}
const WebAdventureScene = await loadDefault("src/models/web-adventure-scene.tsx");
const PainterImageQuota = await loadDefault("src/models/painter-image-quota.tsx");

const imageGenMod = await jiti.import(path.join(webappRoot, "src/lib/painter/imageGen.ts"));
const { translateAndGenerate } = imageGenMod;

// -- helpers ----------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function todayKey(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const PAINTER_DAILY_LIMIT = parseInt(process.env.PAINTER_IMAGE_DAILY_LIMIT ?? "50", 10);

async function tryConsumeDailyQuota() {
  const key = todayKey();
  try {
    const result = await PainterImageQuota.findOneAndUpdate(
      { _id: key, count: { $lt: PAINTER_DAILY_LIMIT } },
      { $inc: { count: 1 }, $setOnInsert: { _id: key } },
      { upsert: true, new: true },
    );
    return result !== null;
  } catch (err) {
    if (err?.code === 11000) return false;
    throw err;
  }
}

// -- Gemini: the body -> a Korean pixel-art prompt, written automatically ---
const PROMPT_GEN_SYSTEM = `너는 게임 일러스트 prompt 작성자다.
한국어 CYOA 씬 묘사를 받아, *환경/조명/주요 사물* 만 추출한 *시각적 한국어 prompt* 로 변환한다.
규칙:
- 인물(사람/도깨비/마법사/산신령 등) 또는 *신체 부위(손/얼굴/등 등)* 은 *prompt 에 절대 포함 X* — 빈 환경/소품만.
- 대사("\\"..\\"") 와 감정 어휘 무시. 그 장면이 *벌어진 장소/시간대/사물* 만 묘사.
- 묘사에 환경이 빈약하면 씬 제목에서 *장소* 를 추론 (예: "마을 광장", "동굴", "마법사의 오두막", "마을 어귀").
- 핵심 시각 키워드 6~10 개를 *쉼표로* 나열 (조명·시간대·핵심 소품·재질·분위기).
- 끝에 반드시 다음 스타일 키워드를 *그대로* 덧붙인다: "${STYLE_SUFFIX}"
- 출력은 *한 줄* 의 prompt 만. 설명/따옴표/머리말 없음.`;

function isRateLimit(err) {
  const msg = String(err?.message ?? err);
  return /\b(429|RESOURCE_EXHAUSTED|quota|rate)\b/i.test(msg);
}

// An exponential backoff retry on Pollinations' rate limit (402/429/5xx).
//   The waits: 2,4,8,16,32,64,128,256s ... capped at 300s. It waits until the rate limit clears.
//   An error that is not a rate limit throws at once.
async function withBackoff(fn, label = "gen") {
  const MAX = parseInt(process.env.PAINTER_MAX_RETRIES ?? "8", 10);
  let lastErr;
  for (let attempt = 0; attempt <= MAX; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message ?? e);
      const retriable = /\b(402|429|RESOURCE_EXHAUSTED|rate|500|502|503|504)\b/i.test(msg);
      if (!retriable || attempt === MAX) throw e;
      const waitMs = Math.min(2 ** (attempt + 1) * 1000, 300000);
      console.log(`  [backoff ${label}] ${msg.slice(0, 30)} — ${Math.round(waitMs / 1000)}s 후 재시도 ${attempt + 1}/${MAX}`);
      await sleep(waitMs);
    }
  }
  throw lastErr;
}

async function generateKoreanPromptFromBody(title, body, geminiKey) {
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const userInput = `씬 제목: ${title}\n\n씬 묘사:\n${body.join("\n")}`;

  // The model and retry matrix. The RPD limit comes first - Gemma 4 (RPD 1,500 with unlimited TPM) is
  // the main model and the newer Gemini the fallback. (2.5 Flash's RPD of 20 is spent quickly in a batch.)
  const PLANS = [
    { model: "gemma-4-26b-a4b-it",     waits: [0, 8000, 20000] },
    { model: "gemma-4-31b-it",         waits: [0, 8000, 20000] },
    { model: "gemini-3.1-flash-lite",  waits: [0, 8000, 20000] },
    { model: "gemini-2.5-flash-lite",  waits: [0, 8000, 20000] },
  ];
  let lastErr;
  for (const plan of PLANS) {
    for (let attempt = 0; attempt < plan.waits.length; attempt++) {
      if (plan.waits[attempt] > 0) {
        console.log(`  [gemini-prompt] ${plan.model} 재시도 #${attempt + 1} — ${plan.waits[attempt]}ms 대기`);
        await sleep(plan.waits[attempt]);
      }
      try {
        const result = await ai.models.generateContent({
          model: plan.model,
          config: { systemInstruction: PROMPT_GEN_SYSTEM },
          contents: userInput,
        });
        let text = (result.text ?? "").trim();
        if (!text) { lastErr = new Error(`empty from ${plan.model}`); continue; }
        text = text.replace(/^["']|["']$/g, "").replace(/\s*\n+\s*/g, ", ").trim();
        if (!text.includes(STYLE_SUFFIX.slice(0, 8))) {
          text = `${text}, ${STYLE_SUFFIX}`;
        }
        return text;
      } catch (e) {
        lastErr = e;
        const msg = String(e?.message ?? e).slice(0, 160);
        console.warn(`  [gemini-prompt] ${plan.model} 시도 ${attempt + 1} 실패: ${msg}`);
        if (!isRateLimit(e)) break; // Retrying the same model is pointless unless it was a 429
      }
    }
  }
  throw lastErr ?? new Error("Gemini prompt 작성 실패");
}

// -- the MinIO client -------------------------------------------------------
let _minioClient = null;
function getMinioClient() {
  if (!_minioClient) {
    _minioClient = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT,
      port: process.env.MINIO_PORT ? parseInt(process.env.MINIO_PORT, 10) : undefined,
      useSSL: true,
      accessKey: process.env.MINIO_ACCESSKEY,
      secretKey: process.env.MINIO_SECRETKEY,
    });
  }
  return _minioClient;
}

// -- main -------------------------------------------------------------------
const results = [];
let startedAt = Date.now();

try {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("[painter-scenes] MongoDB 연결 OK.");

  // Checking the current quota (for the report)
  const todayQuotaDoc = await PainterImageQuota.findById(todayKey()).lean();
  const startCount = todayQuotaDoc?.count ?? 0;
  console.log(`[painter-scenes] 오늘 quota 시작: ${startCount}/${PAINTER_DAILY_LIMIT}`);

  // Fetching the target scenes - those given by ONLY_IDS, or otherwise a dynamic fetch of *every scene
  // that is a placeholder in mongo right now* (adapting automatically to newly seeded ones).
  let ids;
  if (ONLY_IDS) {
    ids = ONLY_IDS;
  } else if (ALL) {
    const allScenes = await WebAdventureScene.find({}, { id: 1 }).lean();
    ids = allScenes.map((s) => s.id);
    console.log(`[painter-scenes] 전체 재생성 대상: ${ids.length} 씬 × ${VARIATIONS} 장`);
  } else {
    const placeholderScenes = await WebAdventureScene.find({
      illustration: /placeholder/,
    }, { id: 1 }).lean();
    ids = placeholderScenes.map((s) => s.id);
    console.log(`[painter-scenes] 동적 placeholder 대상: ${ids.length} 씬`);
  }
  const scenes = await WebAdventureScene.find({ id: { $in: ids } }).lean();
  const sceneById = new Map(scenes.map((s) => [s.id, s]));

  // KEEP_IDS guard
  for (const id of ids) {
    if (KEEP_IDS.has(id)) {
      console.error(`[painter-scenes] 보호된 씬 ${id} — 처리 거부.`);
      process.exit(1);
    }
  }

  const missing = ids.filter((id) => !sceneById.has(id));
  if (missing.length > 0) {
    console.error("[painter-scenes] 누락 씬:", missing);
    process.exit(1);
  }

  // Loading the prompt cache (reusing an earlier dry run's result - fewer Gemini calls)
  const promptCache = new Map();
  if (PROMPT_CACHE_PATH && fs.existsSync(PROMPT_CACHE_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(PROMPT_CACHE_PATH, "utf8"));
      for (const r of raw.results ?? []) {
        if (r.ok && r.koreanPrompt) promptCache.set(r.id, r.koreanPrompt);
      }
      console.log(`[painter-scenes] prompt 캐시 로드: ${promptCache.size} 개 (${PROMPT_CACHE_PATH})`);
    } catch (e) {
      console.warn(`[painter-scenes] prompt 캐시 로드 실패:`, String(e?.message ?? e));
    }
  }

  // The English prompt override - bypassing Gemini's translation (English goes straight to Pollinations)
  const englishOverrides = new Map();
  if (EN_OVERRIDE_PATH && fs.existsSync(EN_OVERRIDE_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(EN_OVERRIDE_PATH, "utf8"));
      for (const [id, en] of Object.entries(raw)) {
        if (typeof en === "string" && en.trim()) englishOverrides.set(id, en.trim());
      }
      console.log(`[painter-scenes] 영어 오버라이드 로드: ${englishOverrides.size} 개 (${EN_OVERRIDE_PATH})`);
    } catch (e) {
      console.warn(`[painter-scenes] 영어 오버라이드 로드 실패:`, String(e?.message ?? e));
    }
  }

  console.log(`[painter-scenes] 처리 대상 ${ids.length} 씬 (DRY_RUN=${DRY_RUN}).\n`);

  let quotaWarned = false;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const scene = sceneById.get(id);
    const idx = `[${i + 1}/${ids.length}]`;
    console.log(`${idx} ${id} — ${scene.title}`);

    // With an override, the AI (Gemma and the translation) is *never called* - the English prompt is used directly.
    //   koreanPrompt is only for the record, so a cached value or a placeholder is enough.
    const enOverride = englishOverrides.get(id);
    let koreanPrompt;
    const cached = promptCache.get(id);
    if (enOverride) {
      koreanPrompt = cached ?? "(영어 override 직접 사용 — AI 미호출)";
    } else if (cached) {
      koreanPrompt = cached;
      console.log(`  prompt(KR) [cached]: ${koreanPrompt}`);
    } else {
      // The AI call - limited to once a minute by the user's policy (only for scenes without an override).
      try {
        koreanPrompt = await generateKoreanPromptFromBody(scene.title, scene.body, process.env.GEMINI_API_KEY);
      } catch (e) {
        console.error(`  [gemini-prompt] 실패 — scene 건너뜀:`, String(e?.message ?? e).slice(0, 200));
        results.push({ id, ok: false, stage: "gemini-prompt", error: String(e?.message ?? e) });
        continue;
      }
      console.log(`  prompt(KR): ${koreanPrompt}`);
      // Once a minute until the next AI call (the user's policy). Applied only between scenes without an override.
      await sleep(parseInt(process.env.PAINTER_AI_INTERVAL_MS ?? "60000", 10));
    }

    if (DRY_RUN) {
      results.push({ id, title: scene.title, koreanPrompt, ok: true, dryRun: true });
      continue;
    }

    // VARIATIONS images generated per scene (seed variants) -> illustrations[].
    const callStart = Date.now();
    const { generateImage } = imageGenMod;
    const urls = [];
    let usedEnPrompt = enOverride ?? null;
    let quotaHit = false;
    for (let v = 0; v < VARIATIONS; v++) {
      // The quota check (an atomic +1, per image).
      const allowed = await tryConsumeDailyQuota();
      if (!allowed) {
        if (!quotaWarned) {
          console.error(`  [quota] 일일 한도 ${PAINTER_DAILY_LIMIT} 초과 — 중단.`);
          quotaWarned = true;
        }
        quotaHit = true;
        break;
      }
      try {
        let gen;
        if (enOverride) {
          gen = await withBackoff(
            () =>
              generateImage(enOverride, {
                minioClient: getMinioClient(),
                bucket: process.env.MINIO_BUCKET,
                endpoint: process.env.MINIO_ENDPOINT,
                pollinations: { seed: v },
              }),
            `${id} v${v + 1}`,
          );
        } else {
          const r = await withBackoff(
            () =>
              translateAndGenerate(koreanPrompt, {
                minioClient: getMinioClient(),
                bucket: process.env.MINIO_BUCKET,
                endpoint: process.env.MINIO_ENDPOINT,
                geminiApiKey: process.env.GEMINI_API_KEY,
                pollinations: { seed: v },
              }),
            `${id} v${v + 1}`,
          );
          gen = { key: r.key, url: r.url };
          usedEnPrompt = r.translatedPrompt;
        }
        urls.push(gen.url);
        console.log(`  [${v + 1}/${VARIATIONS}] ${gen.url}`);
      } catch (e) {
        console.error(`  [painter v${v + 1}] 실패(백오프 소진):`, String(e?.message ?? e).slice(0, 150));
        // 이 배리에이션만 실패 — 나머지 계속.
      }
      if (v < VARIATIONS - 1) await sleep(BETWEEN_VARIATIONS_MS);
    }

    if (urls.length === 0) {
      results.push({ id, ok: false, stage: "painter", koreanPrompt, error: quotaHit ? "quota" : "all-variations-failed" });
      if (quotaHit) break;
      await sleep(2000);
      continue;
    }
    const callMs = Date.now() - callStart;
    console.log(`  painter OK (${callMs}ms): ${urls.length}장`);

    // illustration = the first image (for compatibility), illustrations = every variation.
    await WebAdventureScene.updateOne(
      { id: scene.id },
      { $set: { illustration: urls[0], illustrations: urls } },
    );
    console.log(`  mongo update OK (${urls.length}장)\n`);

    results.push({
      id,
      title: scene.title,
      ok: true,
      koreanPrompt,
      englishPrompt: usedEnPrompt,
      usedPrompt: usedEnPrompt,
      urls,
      url: urls[0],
      callMs,
    });
    if (quotaHit) break;

    // The sleep between scenes - avoiding Gemini's per-minute quota.
    //   2500ms by default (easing the load on Pollinations).
    //   Overridable through the PAINTER_BETWEEN_SCENES_MS environment variable (65000 = once a minute, for example).
    const betweenMs = parseInt(process.env.PAINTER_BETWEEN_SCENES_MS ?? "2500", 10);
    if (i < ids.length - 1) await sleep(betweenMs);
  }

  // the report
  const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  const endQuotaDoc = await PainterImageQuota.findById(todayKey()).lean();
  const endCount = endQuotaDoc?.count ?? startCount;

  console.log("");
  console.log("═══════════════════════════════════════════════");
  console.log(`[painter-scenes] 결과: ok ${ok} / fail ${fail} (총 ${results.length})`);
  console.log(`[painter-scenes] 소요: ${elapsedSec}s`);
  console.log(`[painter-scenes] quota: ${startCount} → ${endCount} (+${endCount - startCount})`);
  console.log(`[painter-scenes] DRY_RUN=${DRY_RUN}`);
  console.log("═══════════════════════════════════════════════");

  // Saving the result JSON (used as input for updating ATTRIBUTION.md)
  const outPath = path.join(webappRoot, "scripts", `painter-scene-results.json`);
  fs.writeFileSync(outPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    startCount, endCount,
    results,
  }, null, 2));
  console.log(`[painter-scenes] 결과 저장: ${outPath}`);

} catch (e) {
  console.error("[painter-scenes] 치명적 에러:", e);
  process.exit(1);
} finally {
  await mongoose.disconnect();
}
