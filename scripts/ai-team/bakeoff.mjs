#!/usr/bin/env node
// 후보 모델을 실제로 돌려 순위를 갱신한다 (#305). 주 1회.
//
// ── 왜 필요한가 ────────────────────────────────────────────────────────
//
// `model-pick.mjs` 는 목록 조회로 **은퇴**를 잡지만, "목록에는 있는데 느리거나 못 하는"
// 경우는 못 잡는다. 그건 돌려 봐야 안다.
//
// ── 한도 소진을 무능으로 치지 않는다 ────────────────────────────────────
//
// 처음 잴 때 후보 셋이 실패했는데 원인이 능력이 아니라 무료 일일 한도였다. 그대로
// 반영했으면 멀쩡한 모델이 영구 강등됐다. 한도·도달 불가는 `skip` 으로 남기고
// `ranking.mjs` 가 이전 순위를 지켜 준다.
//
// 과제는 파이프라인 코더 1회차와 같은 꼴이다 — 실패하는 테스트와 껍데기를 주고 구현시킨 뒤
// 게이트로 판정한다. **대상 파일을 명시한다**: "방금 쓴 테스트" 라고만 하면 2700개 테스트
// 사이를 헤매다 전부 타임아웃한다(실측).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { CODER_PREFERENCE, MANAGER_PREFERENCE } from './model-pick.mjs';
import { rankResults, readRanking, RANKING_PATH } from './ranking.mjs';
import { readFileSync } from 'node:fs';

const REPO = process.env.AI_TEAM_REPO?.trim() || '/home/seungrye/site';
const OUT = process.env.AI_TEAM_RANKING?.trim() || RANKING_PATH;
/** 한 모델에 주는 시간. 이보다 오래 끌면 파이프라인에서 못 쓴다. */
const LIMIT_SEC = Number(process.env.AI_TEAM_BAKEOFF_TIMEOUT) || 300;

const log = (m) => console.log(`\x1b[1;36m[bakeoff]\x1b[0m ${m}`);
const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...opts });

/** 한도·도달 불가인가 — 무능과 구분해야 한다. */
const 못잰것 = (out) => /rate limit|free-models-per-day|not found|only available on|quota|insufficient/i.test(out);

const TEST = `import { describe, it, expect } from 'vitest';
import { slugify } from '../../../../scripts/ai-team/bake-probe.mjs';

describe('slugify', () => {
  it('공백을 하이픈으로, 소문자로', () => expect(slugify('Hello World')).toBe('hello-world'));
  it('앞뒤 공백을 턴다', () => expect(slugify('  a b  ')).toBe('a-b'));
  it('연속 공백은 하이픈 하나', () => expect(slugify('a   b')).toBe('a-b'));
  it('영숫자와 하이픈만', () => expect(slugify('a!@#b')).toBe('ab'));
  it('한글은 그대로', () => expect(slugify('한글 제목')).toBe('한글-제목'));
  it('빈 문자열', () => expect(slugify('')).toBe(''));
  it('문자열이 아니면 빈 문자열', () => expect(slugify(null as never)).toBe(''));
});
`;
const SHELL = `/** 아직 구현되지 않았습니다. */
export function slugify(title) { throw new Error('slugify: 아직 구현되지 않았습니다'); }
`;
const PROMPT = `scripts/ai-team/bake-probe.mjs 의 slugify 를 구현하세요.
시험은 webapp/src/lib/ai-team/bake-probe.test.ts 입니다.
- **테스트 파일은 절대 수정하지 마세요.**
- 다른 파일은 건드리지 마세요.`;

/** 후보 하나를 재고 `{id,status,seconds}` 를 준다. */
function measure(model, worktree) {
  sh('git', ['reset', '-q', '--hard', 'HEAD'], { cwd: worktree });
  sh('git', ['clean', '-qfd'], { cwd: worktree });
  writeFileSync(join(worktree, 'scripts/ai-team/bake-probe.mjs'), SHELL, 'utf8');
  writeFileSync(join(worktree, 'webapp/src/lib/ai-team/bake-probe.test.ts'), TEST, 'utf8');

  const started = Date.now();
  let out = '';
  try {
    out = sh('timeout', [String(LIMIT_SEC), 'opencode', 'run', '--dir', worktree, '-m', `openrouter/${model}`, PROMPT],
      { cwd: worktree, stdio: 'pipe' });
  } catch (e) {
    out = `${e?.stdout ?? ''}${e?.stderr ?? ''}`;
  }
  const seconds = Math.round((Date.now() - started) / 1000);

  if (못잰것(out)) return { id: model, status: 'skip', seconds };

  // 테스트를 고쳤으면 무효다 — 파이프라인이 막는 바로 그 위반이다.
  const touched = sh('git', ['diff', '--name-only', '--', '*.test.ts'], { cwd: worktree }).trim();
  if (touched) return { id: model, status: 'fail', seconds };

  try {
    sh('pnpm', ['exec', 'vitest', 'run', 'src/lib/ai-team/bake-probe.test.ts'],
      { cwd: join(worktree, 'webapp'), stdio: 'pipe' });
    return { id: model, status: 'pass', seconds };
  } catch {
    return { id: model, status: 'fail', seconds };
  }
}

const worktree = mkdtempSync(join(tmpdir(), 'ai-bakeoff-'));
rmSync(worktree, { recursive: true, force: true });
sh('git', ['worktree', 'add', '-q', '--detach', worktree, 'main'], { cwd: REPO });
try { sh('ln', ['-sfn', join(REPO, 'webapp/node_modules'), join(worktree, 'webapp/node_modules')]); } catch { /* 있으면 그만 */ }

let previous = { coder: [], manager: [] };
try { previous = readRanking(readFileSync(OUT, 'utf8'), { now: Math.floor(Date.now() / 1000) }) ?? previous; } catch { /* 처음 */ }

const roles = {};
for (const [role, candidates] of [['coder', CODER_PREFERENCE], ['manager', MANAGER_PREFERENCE]]) {
  const results = [];
  for (const m of candidates) {
    const r = measure(m, worktree);
    log(`${role} ${m} → ${r.status} (${r.seconds}s)`);
    results.push(r);
  }
  roles[role] = rankResults({ results, previous: previous[role] });
  log(`${role} 순위: ${roles[role].join(' > ')}`);
}

try { sh('git', ['worktree', 'remove', '--force', worktree], { cwd: REPO, stdio: 'pipe' }); } catch { /* 이미 없다 */ }

// 전부 못 쟀으면 덮어쓰지 않는다 — 한도 소진일 때 기존 순위를 지운다.
const 잰것 = Object.values(roles).some((v) => v.length > 0);
if (!잰것) { log('아무것도 재지 못했습니다 — 기존 순위를 유지합니다.'); process.exit(0); }

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ measuredAt: Math.floor(Date.now() / 1000), roles }, null, 2)}\n`, 'utf8');
log(`기록: ${OUT}`);
