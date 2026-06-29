#!/usr/bin/env node
// seed-358-playscript.mjs — 씬 본문을 *희곡(연극 대본) 형식*으로 재구성.
//
// 의도(#358): 사용자가 산문체가 아니라 "연극 시나리오" 느낌을 원함.
//   지문은 *이탤릭*, 등장인물 대사는 **인물명** *(행동)* + "대사" 형식.
//
// 설계:
//   - bodyProse 보존 — 최초 실행 때 현재 body(소설 산문)를 bodyProse 에 백업. 이후
//     *항상 bodyProse 기준* 으로 재변환 → 재실행해도 누적·폭주 안 함(멱등성).
//   - 엔딩 씬(isEnding)은 제외 — 후일담 마커("—" 시작 마지막 줄, #275 테스트) 보존.
//   - AI: Gemma 4 메인 + 폴백(translate.ts 동일). rate limit 60초/씬, 실패 시 제곱 백오프.
//   - 검증: 비엔딩 ≥3줄. 미달이면 원본 유지(스킵).
//
// 사용:
//   node --env-file=.env.local scripts/seed-358-playscript.mjs --only kael_infirmary --dry
//   node --env-file=.env.local scripts/seed-358-playscript.mjs --all

import mongoose from 'mongoose';
import { GoogleGenAI } from '@google/genai';

const KEY = process.env.GEMINI_API_KEY;
const MODELS = ['gemma-4-26b-a4b-it', 'gemma-4-31b-it', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];

const SYSTEM = `너는 다크 판타지 인터랙티브 소설 〈에테르니아의 추락〉의 씬을 *희곡(연극 대본) 형식*으로 다시 쓰는 작가다.

[형식 규칙]
- 무대·상황 묘사(지문)는 *별표로 감싼 이탤릭* 한 줄로. 예: *의무동. 차가운 금속 침대. 시큼한 에테르 정제수 냄새.*
- 2인칭 "너"의 행동·내면도 지문으로 쓴다(평문 또는 이탤릭). 주인공은 "너"로 지칭.
- 등장인물의 대사는 두 줄로 나눈다:
    **인물명** *(행동/표정 지문, 없으면 생략)*
    "대사 내용"
- **인물명 헤더(**이름**) 바로 다음 줄은 반드시 그 인물의 대사("...")여야 한다.** 인물의 배경·소개·외양은 헤더를 붙이지 말고 *지문*으로 따로 쓴다.
- 화자명은 *단일 인물* 또는 명확한 집단 하나("사제단")로. "A와 B"처럼 복수로 묶지 마라. 두 사람이 번갈아 말하면 각각 별도 헤더+대사로 분리한다.
- 강조가 필요한 핵심어는 *별표*로.

[엄격한 제약]
- 기존 본문의 *사건·정보·대사·등장인물·분위기를 절대 바꾸지 마라*. 형식만 희곡으로 재구성한다.
- 본문에 없는 대사나 사건을 지어내지 마라. 산문 속 대사("...")만 인물 대사로 분리하고, 화자가 분명하면 인물명을 붙여라(불분명하면 지문으로).
- 선택지는 본문에 넣지 마라(별도 UI).

[출력]
JSON 배열만. 각 줄이 배열의 한 원소. 예:
["*의무동. 차가운 금속 침대.*","너는 눈을 뜬다. 손목에 푸른 결정이 돋아 있다.","**벤딕트 박사** *(차트를 넘기며)*","\\"침식도 80. 즉시 정제소로.\\"","*문 앞으로 발소리가 다가온다.*"]
설명·머리말·코드펜스 금지. 배열만 출력.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isTransient(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(503|429|500|502|504|UNAVAILABLE|RESOURCE_EXHAUSTED|fetch failed|HEADERS_TIMEOUT|ETIMEDOUT|ECONNRESET|ENOTFOUND)\b/i.test(msg);
}

function parseBody(raw) {
  let s = (raw ?? '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  let arr;
  try { arr = JSON.parse(s); } catch { return null; }
  if (!Array.isArray(arr)) return null;
  const lines = arr.map((x) => String(x).trim()).filter(Boolean);
  return lines.length ? lines : null;
}

async function callModel(ai, model, user) {
  const result = await ai.models.generateContent({
    model,
    config: { systemInstruction: SYSTEM, temperature: 0.7 },
    contents: user,
  });
  return result.text ?? '';
}

async function convertOne(ai, scene) {
  const source = scene.bodyProse ?? scene.body ?? [];
  const user = [`제목: ${scene.title ?? scene.id}`, '', '산문 본문:', ...source.map((b) => `- ${b}`)].join('\n');
  let lastErr;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const raw = await callModel(ai, model, user);
        const lines = parseBody(raw);
        if (!lines) { lastErr = new Error(`parse 실패 (${model})`); break; }
        if (lines.length < 3) { lastErr = new Error(`줄 수 부족 ${lines.length} (${model})`); break; }
        return { lines, model, source };
      } catch (err) {
        lastErr = err;
        if (!isTransient(err)) break;
        const wait = Math.min(2 ** attempt * 5, 120);
        console.warn(`    ↻ ${model} transient — ${wait}s 후 재시도`);
        await sleep(wait * 1000);
      }
    }
  }
  throw lastErr ?? new Error('알 수 없는 실패');
}

function parseArgs() {
  const a = process.argv.slice(2);
  const dry = a.includes('--dry');
  const all = a.includes('--all');
  let only = null;
  const oi = a.indexOf('--only');
  if (oi >= 0 && a[oi + 1]) only = a[oi + 1].split(',').map((s) => s.trim()).filter(Boolean);
  return { dry, all, only };
}

async function main() {
  if (!KEY) { console.error('✗ GEMINI_API_KEY 없음'); process.exit(1); }
  const { dry, all, only } = parseArgs();
  if (!all && !only) { console.error('사용: --all 또는 --only id1,id2 (+ --dry)'); process.exit(1); }

  const ai = new GoogleGenAI({ apiKey: KEY });
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));

  const query = only ? { id: { $in: only } } : { isEnding: { $ne: true } }; // 엔딩 제외.
  const scenes = await Scene.find(query).lean();
  scenes.sort((x, y) => x.id.localeCompare(y.id));
  console.log(`대상 ${scenes.length} 씬${dry ? ' (DRY)' : ''} (엔딩 제외)\n`);

  let ok = 0, fail = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    if (s.isEnding) { console.log(`[${i + 1}/${scenes.length}] ${s.id} — 엔딩, 스킵`); continue; }
    process.stdout.write(`[${i + 1}/${scenes.length}] ${s.id} … `);
    try {
      const { lines, model, source } = await convertOne(ai, s);
      console.log(`✓ ${source.length}→${lines.length}줄 (${model})`);
      if (dry) { lines.forEach((l) => console.log(`      | ${l}`)); }
      else {
        const update = { body: lines };
        if (!s.bodyProse) update.bodyProse = source;
        await Scene.findOneAndUpdate({ id: s.id }, update);
      }
      ok++;
    } catch (err) {
      console.log(`✗ ${(err.message ?? err).toString().slice(0, 120)}`);
      fail++;
    }
    if (i < scenes.length - 1) await sleep(60_000);
  }

  await mongoose.disconnect();
  console.log(`\n완료 — 성공 ${ok} / 실패 ${fail}`);
  if (fail) process.exit(2);
}

main().catch((e) => { console.error(e); process.exit(1); });
