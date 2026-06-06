#!/usr/bin/env node
// scripts/web-adventure-structure-lint.mjs — #271 콘텐츠 구조 lint CLI.
//
// 기존 web-adventure-lint.mjs (#248) 는 *본문 톤* (길이/문단) 위주. 본 도구는
// *그래프 구조* — orphan / dead-end / 3 분기 초과 / dangling ref / 6 엔딩 도달성.
//
// 사용:
//   MONGO_URI=mongodb://127.0.0.1:27017/handmade-site \
//     node scripts/web-adventure-structure-lint.mjs

import mongoose from 'mongoose';

const ALL_ENDINGS = [
  'ascension', 'revolution', 'harmony',
  'fall', 'petrification', 'sylvan_bond',
];
const START_SCENES = ['kael_infirmary', 'rin_harbor', 'solwen_grove'];
const AUTO_ENDING_SCENES = [
  'ending_petrification',
  // #318 — isDead/isFullyPetrified 자동 ending 잔재. RNG 실패가 우회 씬으로 가도록
  //   redirect 됐지만 옛 시나리오 ending 씬 자체는 보존 (역사적 dead-end).
  'kael_caught', 'rin_chase', 'rin_caught',
];

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';

function collectTargets(scene) {
  const t = [];
  for (const c of scene.choices ?? []) {
    if (c.to) t.push(c.to);
    if (c.onSuccess) t.push(c.onSuccess);
    if (c.onFailure) t.push(c.onFailure);
  }
  return t;
}

function bfsScenes(registry, roots) {
  const visited = new Set();
  const q = [...roots];
  while (q.length) {
    const id = q.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const s = registry[id];
    if (!s) continue;
    for (const t of collectTargets(s)) if (!visited.has(t)) q.push(t);
  }
  return visited;
}

function bfsEndings(registry, roots) {
  const visited = new Set();
  const endings = new Set();
  const q = [...roots];
  while (q.length) {
    const id = q.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const s = registry[id];
    if (!s) continue;
    if (s.isEnding && s.endingId) { endings.add(s.endingId); continue; }
    for (const t of collectTargets(s)) if (!visited.has(t)) q.push(t);
  }
  return endings;
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error(`${RED}MONGO_URI 환경변수 필요${RESET}`);
    process.exit(2);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const Scene = mongoose.model('S', new mongoose.Schema({}, { strict: false, collection: 'webadventurescenes' }));
  const all = await Scene.find({}).lean();
  const registry = Object.fromEntries(all.map((s) => [s.id, s]));
  const autoSet = new Set(AUTO_ENDING_SCENES);

  const issues = [];

  // ORPHAN
  const reachable = bfsScenes(registry, START_SCENES);
  for (const id of Object.keys(registry)) {
    if (!reachable.has(id) && !autoSet.has(id)) issues.push({ code: 'ORPHAN', sceneId: id });
  }

  // DEAD_END / TOO_MANY_CHOICES / DANGLING_REF
  for (const id of Object.keys(registry)) {
    const s = registry[id];
    if ((!s.choices || s.choices.length === 0) && !s.isEnding) {
      issues.push({ code: 'DEAD_END', sceneId: id });
    }
    if (s.choices && s.choices.length > 3) {
      issues.push({ code: 'TOO_MANY_CHOICES', sceneId: id, detail: `${s.choices.length} > 3` });
    }
    for (const t of collectTargets(s)) {
      if (!registry[t]) issues.push({ code: 'DANGLING_REF', sceneId: id, detail: `→ ${t}` });
    }
  }

  // UNREACHABLE_ENDING
  const reached = bfsEndings(registry, START_SCENES);
  const autoEndingIds = new Set(
    AUTO_ENDING_SCENES
      .map((id) => registry[id])
      .filter((s) => s?.isEnding && s.endingId)
      .map((s) => s.endingId),
  );
  for (const e of ALL_ENDINGS) {
    if (!reached.has(e) && !autoEndingIds.has(e)) {
      issues.push({ code: 'UNREACHABLE_ENDING', endingId: e });
    }
  }

  await mongoose.disconnect();

  if (issues.length === 0) {
    console.log(`${GREEN}✓ 콘텐츠 구조 lint 통과 — ${all.length} 씬 / ${ALL_ENDINGS.length} 엔딩 모두 정상${RESET}`);
    process.exit(0);
  }

  console.error(`${RED}✗ ${issues.length} 위반${RESET}`);
  const byCode = {};
  for (const i of issues) {
    byCode[i.code] = (byCode[i.code] ?? []);
    byCode[i.code].push(i);
  }
  for (const code of Object.keys(byCode)) {
    console.error(`${YELLOW}${code}${RESET} (${byCode[code].length}):`);
    for (const i of byCode[code]) {
      const label = i.sceneId ?? i.endingId ?? '?';
      const tail = i.detail ? ` ${DIM}— ${i.detail}${RESET}` : '';
      console.error(`  ${label}${tail}`);
    }
  }
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(2); });
