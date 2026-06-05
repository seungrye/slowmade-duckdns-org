#!/usr/bin/env node
// scripts/web-adventure-lint.mjs — #248 씬 콘텐츠 검토 도구.
//
// /api/web-adventure/content/v1 에서 30 씬을 fetch 한 후 다음 규칙으로 검사:
//   ERROR
//     - body 가 빈 배열.
//     - choices 가 비어있는데 isEnding=false.
//   WARN
//     - 한 문단(body 의 한 entry) > 300 자.
//     - 씬 본문 합계 < 80 자 또는 > 1800 자.
//     - choice label > 60 자.
//     - 동일 endingId 가 isEnding 씬 사이 충돌.
//
// 사용:
//   pnpm node scripts/web-adventure-lint.mjs                # 프로덕션 (https://slowmade.duckdns.org)
//   API_BASE=http://localhost:3010 pnpm node scripts/web-adventure-lint.mjs  # 로컬

const API_BASE = process.env.API_BASE ?? 'https://slowmade.duckdns.org';
const ENDPOINT = `${API_BASE}/api/web-adventure/content/v1`;

const PARA_MAX = 300;
const BODY_TOTAL_MIN = 80;
const BODY_TOTAL_MAX = 1800;
const LABEL_MAX = 60;

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';

async function main() {
  console.log(`${DIM}fetch: ${ENDPOINT}${RESET}`);
  const res = await fetch(ENDPOINT);
  if (!res.ok) {
    console.error(`${RED}ERR HTTP ${res.status}${RESET}`);
    process.exit(2);
  }
  const json = await res.json();
  const scenes = json?.data?.scenes ?? json?.scenes ?? [];
  if (!Array.isArray(scenes) || scenes.length === 0) {
    console.error(`${RED}ERR scenes 가 비어있다${RESET}`);
    process.exit(2);
  }

  let errors = 0;
  let warns = 0;
  const endingMap = new Map();

  for (const s of scenes) {
    const issues = [];
    // body
    if (!Array.isArray(s.body) || s.body.length === 0) {
      issues.push({ level: 'ERROR', msg: 'body 가 비어있다' });
    } else {
      const total = s.body.reduce((acc, p) => acc + (p?.length ?? 0), 0);
      if (total < BODY_TOTAL_MIN) {
        issues.push({ level: 'WARN', msg: `본문 합계 ${total}자 < ${BODY_TOTAL_MIN}` });
      } else if (total > BODY_TOTAL_MAX) {
        issues.push({ level: 'WARN', msg: `본문 합계 ${total}자 > ${BODY_TOTAL_MAX}` });
      }
      for (let i = 0; i < s.body.length; i++) {
        if ((s.body[i]?.length ?? 0) > PARA_MAX) {
          issues.push({ level: 'WARN', msg: `body[${i}] ${s.body[i].length}자 > ${PARA_MAX}` });
        }
      }
    }
    // choices
    const isEnding = !!s.isEnding;
    if ((!s.choices || s.choices.length === 0) && !isEnding) {
      issues.push({ level: 'ERROR', msg: 'choices 비어있는데 isEnding=false (막다른 씬)' });
    }
    if (s.choices) {
      for (const c of s.choices) {
        if ((c?.label?.length ?? 0) > LABEL_MAX) {
          issues.push({ level: 'WARN', msg: `choice ${c.id} label ${c.label.length}자 > ${LABEL_MAX}` });
        }
      }
    }
    // ending id 충돌 — 같은 endingId 가 두 씬에서.
    if (isEnding && s.endingId) {
      if (endingMap.has(s.endingId)) {
        issues.push({
          level: 'ERROR',
          msg: `endingId '${s.endingId}' 가 이미 '${endingMap.get(s.endingId)}' 에 사용됨`,
        });
      } else {
        endingMap.set(s.endingId, s.id);
      }
    }

    if (issues.length === 0) continue;
    console.log(`\n${DIM}── ${s.id}${RESET} (${s.title})`);
    for (const it of issues) {
      const color = it.level === 'ERROR' ? RED : YELLOW;
      console.log(`  ${color}${it.level}${RESET} ${it.msg}`);
      if (it.level === 'ERROR') errors++;
      else warns++;
    }
  }

  console.log(`\n총 ${scenes.length} 씬: ${RED}${errors} error${RESET}, ${YELLOW}${warns} warn${RESET}`);
  if (errors === 0 && warns === 0) console.log(`${GREEN}✓ 깔끔${RESET}`);

  // 엔딩 도달 6 종 모두 정의됐는지 확인.
  for (const expected of ['main', 'spirit', 'fail', 'shopkeeper', 'goblin_friend', 'wizard_apprentice']) {
    if (!endingMap.has(expected)) {
      console.log(`${RED}MISSING ending '${expected}' — 정의 안 됨${RESET}`);
      errors++;
    }
  }

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`${RED}예외${RESET}`, err);
  process.exit(2);
});
