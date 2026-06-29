#!/usr/bin/env node
// seed-355-enrich-bodies.mjs — 전 씬 본문을 "요약본" → "소설" 톤으로 AI 윤색.
//
// 의도(#355):
//   기존 본문은 평균 3.4줄/203자로 *스토리 요약본* 느낌. 감각 묘사·주인공 내면·
//   NPC 대사/개입을 더해 *소설처럼* 읽히도록 확장. 단 기존 사건·정보·분기는 절대
//   변형하지 않고 *살만 붙인다*.
//
// 설계:
//   - bodyOriginal 보존 — 첫 실행 때 현재 body 를 bodyOriginal 에 저장. 이후 *항상
//     bodyOriginal 기준* 으로 재확장 → 재실행해도 본문이 누적·폭주하지 않음(멱등성).
//   - AI: Gemma 4 메인 + 폴백 체인(translate.ts 와 동일). GEMINI_API_KEY 필요.
//   - rate limit: 씬 사이 60초(사용자 정책 "1분에 1쿼리"). 실패 시 제곱 백오프 재시도.
//   - 검증: 비엔딩 ≥3줄, 엔딩 ≥1줄. 미달이면 그 씬은 원본 유지(스킵).
//
// 사용:
//   node --env-file=.env.local scripts/seed-355-enrich-bodies.mjs --only kael_infirmary --dry
//   node --env-file=.env.local scripts/seed-355-enrich-bodies.mjs --all
//   node --env-file=.env.local scripts/seed-355-enrich-bodies.mjs --only id1,id2

import mongoose from 'mongoose';
import { GoogleGenAI } from '@google/genai';

const KEY = process.env.GEMINI_API_KEY;
const MODELS = ['gemma-4-26b-a4b-it', 'gemma-4-31b-it', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];

const SYSTEM = `너는 다크 판타지 인터랙티브 소설 〈에테르니아의 추락〉의 씬 본문을 윤색하는 작가다.

[세계관]
- 부유도시 솔라리스는 *에테르 가솔린*(인간 성흔체의 푸른 결정 코어를 적출·정제한 액체 마력)으로 하늘에 떠 있다. 운송용 통엔 노란 라벨.
- 은빛 가면의 *사제단*은 세 달이 정렬하는 마지막 사흘, 지상의 생명을 연료로 태워 신계로 *승천*하려 한다. 호송 열차의 에테르 코어가 의식의 점화기.
- 마력을 다룬 자의 몸엔 *푸른 결정*이 자란다(성흔 침식). 손목·관절부터 굳어가 100에 이르면 완전히 석화되어 마력석이 된다. 시한부의 카운트다운.
- 강철과 증기의 *아이언가드*는 혁명을, 세계수 곁에 잠든 흰 뿔의 *영수*(사슴 형상 정령)와 네오엘프는 숲의 귀환을 꿈꾼다.
- 세 주인공: 카엘(솔라리스에서 폐기 처분된 군인), 린(아이언가드 수사관), 솔웬(세계수를 지키는 네오엘프). 모두 같은 종말—세 달의 정렬—을 향해 각자의 길을 걷는다.
- 색감: 차가운 푸른 빛(에테르 마력) + 검은 연기(가솔린 문명) + 강철/녹. 따뜻한 색은 위기/화염뿐.

[작업]
주어진 씬 본문을 "요약본"에서 "소설"로 확장하라.
- 시각·청각·촉각·후각의 *감각 묘사*, 주인공의 *내면 독백*, 그 자리에 있는 *NPC의 대사·개입*을 더한다.
- 2인칭("너") 시점 유지.
- 기존 본문의 *사건·정보·등장인물·분위기·결과는 절대 바꾸지 마라*. 새 플롯/선택지/결말을 만들지 말고, 있던 사실에 살만 붙여라. (선택지는 본문에 직접 나열하지 마라 — 별도 UI다.)
- 마크업: 강조는 *별표*, 대사는 "큰따옴표". 과한 별표 남발은 금지(핵심어만).
- 분량: 4~6줄. 각 줄은 1~3문장.

[출력]
JSON 배열만. 예: ["첫 줄...", "둘째 줄...", "셋째 줄..."]
설명·머리말·코드펜스 금지. 배열 그 자체만 출력.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isTransient(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(503|429|500|502|504|UNAVAILABLE|RESOURCE_EXHAUSTED|fetch failed|HEADERS_TIMEOUT|ETIMEDOUT|ECONNRESET|ENOTFOUND)\b/i.test(msg);
}

function parseBody(raw) {
  let s = (raw ?? '').trim();
  // 코드펜스 제거.
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // JSON 배열 추출 (앞뒤 잡음 방어).
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  let arr;
  try {
    arr = JSON.parse(s);
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  const lines = arr.map((x) => String(x).trim()).filter(Boolean);
  return lines.length ? lines : null;
}

async function callModel(ai, model, user) {
  const result = await ai.models.generateContent({
    model,
    config: { systemInstruction: SYSTEM, temperature: 0.85 },
    contents: user,
  });
  return result.text ?? '';
}

async function enrichOne(ai, scene) {
  const source = scene.bodyOriginal ?? scene.body ?? [];
  const labels = (scene.choices ?? []).map((c) => c.label).filter(Boolean);
  const user = [
    `제목: ${scene.title ?? scene.id}`,
    scene.isEnding ? '(이 씬은 엔딩 화면이다 — 여운 있게 마무리)' : '',
    labels.length ? `이 씬의 선택지(맥락 참고용, 본문에 나열 금지): ${labels.join(' / ')}` : '',
    '',
    '기존 본문:',
    ...source.map((b) => `- ${b}`),
  ].filter((l) => l !== null).join('\n');

  const minLines = scene.isEnding ? 1 : 3;
  let lastErr;
  for (const model of MODELS) {
    // 모델별 제곱 백오프 (transient 한정, 최대 4회).
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const raw = await callModel(ai, model, user);
        const lines = parseBody(raw);
        if (!lines) {
          lastErr = new Error(`parse 실패 (model=${model})`);
          break; // 파싱 실패는 모델 문제 → 다음 모델로.
        }
        if (lines.length < minLines) {
          lastErr = new Error(`줄 수 부족 ${lines.length}<${minLines} (model=${model})`);
          break;
        }
        return { lines, model, source };
      } catch (err) {
        lastErr = err;
        if (!isTransient(err)) break; // 영구 에러 → 다음 모델.
        const wait = Math.min(2 ** attempt * 5, 120);
        console.warn(`    ↻ ${model} transient(${(err.message ?? err).toString().slice(0, 80)}) — ${wait}s 후 재시도`);
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
  if (!KEY) {
    console.error('✗ GEMINI_API_KEY 없음');
    process.exit(1);
  }
  const { dry, all, only } = parseArgs();
  if (!all && !only) {
    console.error('사용: --all  또는  --only id1,id2  (+ 선택 --dry)');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey: KEY });
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));

  const query = only ? { id: { $in: only } } : {};
  const scenes = await Scene.find(query).lean();
  scenes.sort((x, y) => x.id.localeCompare(y.id));
  console.log(`대상 ${scenes.length} 씬${dry ? ' (DRY — DB 미수정)' : ''}\n`);

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    process.stdout.write(`[${i + 1}/${scenes.length}] ${s.id} … `);
    try {
      const { lines, model, source } = await enrichOne(ai, s);
      console.log(`✓ ${source.length}→${lines.length}줄 (${model})`);
      if (dry) {
        lines.forEach((l) => console.log(`      | ${l}`));
      } else {
        const update = { body: lines };
        if (!s.bodyOriginal) update.bodyOriginal = source; // 최초 1회만 원본 보존.
        await Scene.findOneAndUpdate({ id: s.id }, update);
      }
      ok++;
    } catch (err) {
      console.log(`✗ ${(err.message ?? err).toString().slice(0, 120)}`);
      fail++;
    }
    // 마지막 씬 뒤엔 대기 불필요. dry 도 rate limit 준수.
    if (i < scenes.length - 1) await sleep(60_000);
  }

  await mongoose.disconnect();
  console.log(`\n완료 — 성공 ${ok} / 실패 ${fail}`);
  if (fail) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
