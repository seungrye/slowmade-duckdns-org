// #227 — Web Adventure 25 신규 씬 painter-bot 일러스트 자동 생성.
//
// 사용:
//   node --env-file=.env.local scripts/painter-generate-scene-illustrations.mjs
//   node --env-file=.env.local scripts/painter-generate-scene-illustrations.mjs --dry-run
//   node --env-file=.env.local scripts/painter-generate-scene-illustrations.mjs --only=cave_inside,goblin_encounter
//
// 동작:
//   1. .env.local 의 MONGO_URI 로 직접 연결.
//   2. webadventurescenes 에서 25 개 (KEEP_IDS 제외) 씬 fetch.
//   3. 씬마다:
//      a) Gemini 로 body 텍스트를 *시각적 도트 픽셀 prompt* (한국어) 자동 생성.
//      b) translateAndGenerate (Gemini 한→영 + Pollinations FLUX + MinIO 업로드).
//      c) painter 일일 quota +1 (50/day 한도 체크).
//      d) Scene.illustration 을 MinIO URL 로 update.
//      e) ATTRIBUTION 엔트리 누적.
//   4. ATTRIBUTION.md 의 painter-bot 섹션 갱신 (기존 5 + 신규 25).
//   5. 결과 요약 보고.
//
// 안전장치:
//   - Pollinations rate limit 회피 — 순차 호출 + 호출 간 2 초 sleep.
//   - quota 초과 시 즉시 정지.
//   - --dry-run: 외부 호출 0, mongo write 0 — prompt 만 출력.
//   - 기존 5 대표 씬 (KEEP_IDS) 절대 건드리지 않음.

import path from "node:path";
import fs from "node:fs";
import url from "node:url";

const __filename0 = url.fileURLToPath(import.meta.url);
const __dirname0 = path.dirname(__filename0);
const webappRoot = path.resolve(__dirname0, "..");
const siteRoot = path.resolve(webappRoot, "..");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ONLY_ARG = args.find((a) => a.startsWith("--only="));
const ONLY_IDS = ONLY_ARG ? ONLY_ARG.slice("--only=".length).split(",").filter(Boolean) : null;
const PROMPT_CACHE_ARG = args.find((a) => a.startsWith("--prompt-cache="));
const PROMPT_CACHE_PATH = PROMPT_CACHE_ARG ? PROMPT_CACHE_ARG.slice("--prompt-cache=".length) : null;
const EN_OVERRIDE_ARG = args.find((a) => a.startsWith("--english-overrides="));
const EN_OVERRIDE_PATH = EN_OVERRIDE_ARG ? EN_OVERRIDE_ARG.slice("--english-overrides=".length) : null;

// 기존 5 대표 씬 — 이미지 유지, 절대 건드리지 않음.
// #253 〈에테르니아의 추락〉 — 옛 씬 모두 제거됨. KEEP_IDS 비움.
const KEEP_IDS = new Set([]);

// 〈에테르니아〉 30 + 1 씬 — Kael 1막 / Rin 1막 / Solwen 1막 / 옴팔로스 2-3막 / 6 엔딩.
const TARGET_IDS = [
  // Kael 1막
  "kael_infirmary",
  "kael_corridor",
  "kael_corridor_clear",
  "kael_cargo_container",
  "kael_falling",
  "kael_caught",
  // Rin 1막 — rin_chase / rin_caught 는 #328 dead orphan 정리에서 삭제됨.
  "rin_harbor",
  "rin_evidence",
  "rin_betrayal",
  "rin_underground",
  // Solwen 1막
  "solwen_grove",
  "solwen_combat",
  "solwen_combat_hard",
  "solwen_grief",
  "solwen_departure",
  // 옴팔로스 합류
  "omphalos_outskirts",
  "omphalos_blackmarket",
  "omphalos_station",
  // 클라이맥스
  "climax_harmony_path",
  "climax_revolution_path",
  "climax_sylvan_path",
  "climax_ascension_path",
  "climax_fall_path",
  // 5 엔딩 — ending_petrification 은 #327 에서 삭제 (자동 ending, 씬 데이터 미사용).
  "ending_ascension",
  "ending_revolution",
  "ending_harmony",
  "ending_fall",
  "ending_sylvan_bond",
];

// #253 〈에테르니아의 추락〉 — 다크 에픽 판타지 톤 (천체 마법공학).
const STYLE_SUFFIX = "다크 에픽 판타지, 강철과 증기, 천체 마법공학, 차가운 푸른 빛, 검은 연기, 16비트 RPG 도트 픽셀 아트, 인물 없음";

// env fallback 로드 (node --env-file 미사용 케이스)
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

// ── 헬퍼 ────────────────────────────────────────────────────────────────
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

// ── Gemini: body → 한국어 도트 prompt 자동 작성 ──────────────────────────
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

async function generateKoreanPromptFromBody(title, body, geminiKey) {
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const userInput = `씬 제목: ${title}\n\n씬 묘사:\n${body.join("\n")}`;

  // 모델 + 재시도 매트릭스. RPD 한도 우선 — Gemma 4(RPD 1,500 + TPM 무제한)를
  // 메인으로, 신세대 Gemini 를 폴백. (2.5 Flash 는 RPD 20 으로 배치에서 금방 소진.)
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
        if (!isRateLimit(e)) break; // 429 가 아니면 같은 모델로 재시도 무의미
      }
    }
  }
  throw lastErr ?? new Error("Gemini prompt 작성 실패");
}

// ── MinIO 클라이언트 ────────────────────────────────────────────────────
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

// ── 메인 ────────────────────────────────────────────────────────────────
const results = [];
let startedAt = Date.now();

try {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("[painter-scenes] MongoDB 연결 OK.");

  // 현재 quota 확인 (보고용)
  const todayQuotaDoc = await PainterImageQuota.findById(todayKey()).lean();
  const startCount = todayQuotaDoc?.count ?? 0;
  console.log(`[painter-scenes] 오늘 quota 시작: ${startCount}/${PAINTER_DAILY_LIMIT}`);

  // 대상 씬 fetch — ONLY_IDS 지정 시 그것, 아니면 *현재 mongo 의 placeholder 인
  // 모든 씬* 동적 fetch (시드 신설에 자동 대응).
  let ids;
  if (ONLY_IDS) {
    ids = ONLY_IDS;
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

  // prompt 캐시 로드 (이전 dry-run 결과 재사용 — Gemini 호출 절감)
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

  // 영어 prompt 오버라이드 — Gemini 번역 우회 (Pollinations 에 직접 영어 전송)
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

    let koreanPrompt;
    const cached = promptCache.get(id);
    if (cached) {
      koreanPrompt = cached;
      console.log(`  prompt(KR) [cached]: ${koreanPrompt}`);
    } else {
      try {
        koreanPrompt = await generateKoreanPromptFromBody(scene.title, scene.body, process.env.GEMINI_API_KEY);
      } catch (e) {
        console.error(`  [gemini-prompt] 실패 — scene 건너뜀:`, String(e?.message ?? e).slice(0, 200));
        results.push({ id, ok: false, stage: "gemini-prompt", error: String(e?.message ?? e) });
        continue;
      }
      console.log(`  prompt(KR): ${koreanPrompt}`);
    }

    if (DRY_RUN) {
      results.push({ id, title: scene.title, koreanPrompt, ok: true, dryRun: true });
      continue;
    }

    // quota 체크 (원자적 +1)
    const allowed = await tryConsumeDailyQuota();
    if (!allowed) {
      if (!quotaWarned) {
        console.error(`  [quota] 일일 한도 ${PAINTER_DAILY_LIMIT} 초과 — 이후 씬 중단.`);
        quotaWarned = true;
      }
      results.push({ id, ok: false, stage: "quota", error: "daily-limit-exceeded" });
      break;
    }

    // Pollinations + MinIO
    const callStart = Date.now();
    let painterResult;
    const enOverride = englishOverrides.get(id);
    try {
      if (enOverride) {
        // 사전 번역된 영어 prompt 직접 사용 — Gemini 번역 우회.
        const { generateImage } = imageGenMod;
        const gen = await generateImage(enOverride, {
          minioClient: getMinioClient(),
          bucket: process.env.MINIO_BUCKET,
          endpoint: process.env.MINIO_ENDPOINT,
        });
        painterResult = {
          key: gen.key,
          url: gen.url,
          originalPrompt: koreanPrompt,
          translatedPrompt: enOverride,
          usedPrompt: enOverride,
        };
      } else {
        painterResult = await translateAndGenerate(koreanPrompt, {
          minioClient: getMinioClient(),
          bucket: process.env.MINIO_BUCKET,
          endpoint: process.env.MINIO_ENDPOINT,
          geminiApiKey: process.env.GEMINI_API_KEY,
        });
      }
    } catch (e) {
      console.error(`  [painter] 실패:`, String(e?.message ?? e).slice(0, 200));
      results.push({ id, ok: false, stage: "painter", koreanPrompt, error: String(e?.message ?? e) });
      // 다음 씬으로 (이미 quota 소비는 발생 — Pollinations 부담 회피용 의도적 sleep)
      await sleep(2000);
      continue;
    }
    const callMs = Date.now() - callStart;
    console.log(`  painter OK (${callMs}ms): ${painterResult.url}`);
    if (painterResult.translatedPrompt) {
      console.log(`  prompt(EN): ${painterResult.translatedPrompt}`);
    }

    // Scene.illustration update
    await WebAdventureScene.updateOne(
      { id: scene.id },
      { $set: { illustration: painterResult.url } },
    );
    console.log(`  mongo update OK\n`);

    results.push({
      id,
      title: scene.title,
      ok: true,
      koreanPrompt,
      englishPrompt: painterResult.translatedPrompt,
      usedPrompt: painterResult.usedPrompt,
      minioKey: painterResult.key,
      url: painterResult.url,
      callMs,
    });

    // 씬 사이 sleep — Gemini 분당 quota 회피용.
    //   기본 2500ms (Pollinations 부담 완화).
    //   PAINTER_BETWEEN_SCENES_MS 환경 변수로 override (예: 65000 = 분당 1).
    const betweenMs = parseInt(process.env.PAINTER_BETWEEN_SCENES_MS ?? "2500", 10);
    if (i < ids.length - 1) await sleep(betweenMs);
  }

  // 보고
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

  // 결과 JSON 저장 (ATTRIBUTION.md 갱신 입력으로 사용)
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
