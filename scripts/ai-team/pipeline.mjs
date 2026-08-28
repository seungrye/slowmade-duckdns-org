#!/usr/bin/env node
// 업무 프로세스 파이프라인 (#269).
//
// **클로드가 설계와 테스트를, 코더가 구현을.** 테스트는 코더가 못 만진다. 테스트가 실패하면
// 제품 코드는 코더가 고치고, 테스트를 고쳐야 한다면 그건 클로드가 한다 — 책임이 클로드에게
// 있기 때문이다.
//
// ── coder.mjs 와 무엇이 다른가 ──────────────────────────────────────────
//
// `coder.mjs` 는 **코더가 테스트도 쓴다**(1단계). 여기서는 순서가 뒤집힌다. 그 김에 그쪽의
// 구멍 둘을 막는다 — 둘 다 코드에서 확인한 것이다.
//
//   ① 빨강 게이트가 아무것도 안 잰다 — coder.mjs:59 의 runTests 가 **종료 코드만** 본다.
//      새 모듈이면 "모듈 없음" 으로 0건 수집돼도 실패로 잡히니, 빨강을 통과한 것이 아니라
//      아무것도 안 잰 것이다. → 수집 ≥ 1 && 통과 0 으로 판정한다.
//
//   ② 2단계에 테스트 보호 장치가 없다 — 1단계에는 딴 파일을 되돌리는 거울이 있는데
//      (coder.mjs:170) 2단계에는 없다. 코더가 **테스트를 고쳐** 초록을 만들어도 그대로
//      담긴다. → 매 회차마다 테스트가 바뀌었으면 되돌리고 다시 잰다.
//
// ── 왜 워크트리인가 ────────────────────────────────────────────────────
//
// 클로드에게 파일 쓰기를 준다. 다만 **/tmp 워크트리 안에서만** — 본체(~/site)는 못 건드린다.
// opencode 가 cwd 만으로는 워크트리를 탈출한 전례가 있어(coder.mjs:83) 매 호출 뒤 본체가
// 깨끗한지 확인한다. 클로드에도 같은 주의를 적용한다.
//
// ── 왜 루프를 덧글로 나누지 않았나 ──────────────────────────────────────
//
// 덧글 핑퐁(10회)은 하루 두 번이라 12회면 6일이 걸린다. 게다가 워크트리를 며칠 들고 있어야
// 하는데 /tmp 는 tmpfs 라 재부팅에 사라진다(실측). 그래서 **기계적 반복은 한 실행 안에서**
// 빠르게 돌고, 12회를 다 쓰고도 막히면 그때 덧글로 넘긴다.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
// 게이트 판정은 **테스트와 같은 파일**을 쓴다 — 두 벌로 두면 한쪽만 고쳐지는 날이 온다.
import { redGate, greenGate, GateVerdict } from './gate.mjs';
// 누가 무엇을 고쳤는지 가리는 규칙 — vitest 테스트가 같은 파일을 시험한다.
import { isTest, isImpl } from './snapshot.mjs';
// 워크트리를 어디서 갈라낼지 (#284).
import { resolveBase } from './base.mjs';
// 막혔을 때 무엇을 남길지 — 되돌리기 계획과 보고 문구 (#282, #283).
import {
  StuckKind, revertPlan, needsRebaseline, stuckTitle, stuckIssueBody, stuckComment,
  successComment,
} from './rescue.mjs';

const REPO = '/home/seungrye/site';
// 코더 모델 — **무료 모델을 못박아 쓴다.**
//
// `stealth/ox-alpha` 는 2026-08 에 은퇴했다(404). 후계인 `z-ai/glm-5.3-flash` 는 유료라
// 무료로 돌렸다.
//
// **`openrouter/free` 를 쓰지 말 것.** 그건 무료 모델들 사이의 무작위 라우터라 호출마다
// 어디로 갈지 모른다 — 실제로 `nvidia/nemotron-3.5-content-safety`(콘텐츠 분류기)로 가서
// "PONG" 대신 "User Safety: safe" 를 돌려준 적이 있다. 코더로는 못 쓴다.
//
// 바꾸려면 `AI_CODER_MODEL` 만 주면 된다. 이 값을 손댈 땐 coder.mjs·coder-run.sh·
// .env.local 넷을 함께 고칠 것.
const CODER_MODEL = process.env.AI_CODER_MODEL?.trim() || 'openrouter/minimax/minimax-m3:free';

/** 논의 루프 상한. 넘으면 브랜치를 올리고 이슈를 만든 뒤 덧글로 넘긴다. */
const MAX_ROUNDS = 12;

const log = (m) => console.log(`\x1b[1;36m[pipeline]\x1b[0m ${m}`);
const die = (m) => { console.error(`\x1b[1;31m[pipeline]\x1b[0m ${m}`); process.exit(1); };

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });


function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * git status 로 바뀐 경로들. `??`(신규)과 수정 둘 다.
 *
 * 테스트 감시에는 쓰지 않는다 — 코더가 커밋해 버리면 여기서 아무것도 안 잡힌다(#277).
 * 그쪽은 [touchedTests] 가 커밋 시점과 견준다. 여기는 "클로드가 무엇을 만들었나" 처럼
 * 커밋 전 상태를 볼 때만 쓴다.
 *
 * rename(`R  a -> b`)은 뒤쪽 경로를 취한다. 그게 지금 존재하는 파일이다.
 */
function changedPaths(worktree) {
  return sh('git', ['status', '--porcelain'], { cwd: worktree })
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const status = l.slice(0, 2).trim();
      const rest = l.slice(3).trim();
      const arrow = rest.indexOf(' -> ');
      return { status, path: arrow === -1 ? rest : rest.slice(arrow + 4) };
    });
}

/**
 * 테스트를 돌리고 **몇 건 모였고 몇 건 통과했는지**까지 돌려준다.
 *
 * 종료 코드만으로는 "0건 수집" 과 "다 실패" 를 구분하지 못한다 — 그 구분이 빨강 게이트의
 * 전부다. json 리포터를 파일로 받는다(표준출력에 섞이면 파싱이 깨진다).
 */
function runTests(worktree, paths) {
  const out = join(tmpdir(), `pipeline-vitest-${Date.now()}.json`);
  let output = '';
  try {
    output = sh('pnpm', ['vitest', 'run', '--reporter=json', `--outputFile=${out}`, ...paths], {
      cwd: join(worktree, 'webapp'), stdio: 'pipe',
    });
  } catch (e) {
    output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  let counts = null;
  let detail = '';
  try {
    const raw = readFileSync(out, 'utf8');
    const j = JSON.parse(raw);
    counts = { numTotalTests: j.numTotalTests ?? 0, numPassedTests: j.numPassedTests ?? 0 };
    // **실패 내역을 건져 둔다.** json 리포터를 쓰면 stdout 엔 "JSON report written to …"
    // 한 줄만 남아, 증거 파일이 63바이트짜리 안내문이 됐다(첫 실행에서 확인).
    detail = (j.testResults ?? [])
      .flatMap((f) => (f.assertionResults ?? [])
        .filter((a) => a.status === 'failed')
        .map((a) => `✗ ${a.fullName}\n  ${(a.failureMessages ?? []).join('\n  ').slice(0, 500)}`))
      .join('\n');
  } catch {
    // 리포터를 못 읽었다. 게이트가 "못 읽으면 통과시키지 않는다" 로 처리한다.
  }
  rmSync(out, { force: true });
  return { counts, output: detail || output };
}

/**
 * 코더가 테스트를 만졌나 — **작업트리가 아니라 테스트 커밋 시점과 견준다.**
 *
 * `git status` 만 보면 **코더가 자기 수정을 커밋해 버리는 순간 통째로 뚫린다** — 작업트리가
 * 깨끗해져 아무것도 안 잡힌다. 실제로 재현됐다. 코더는 워크트리에서 도는 일반 에이전트라
 * git 을 쓸 수 있고, 프롬프트가 커밋을 시키진 않지만 막지도 않는다.
 *
 * `git diff <sha>` 는 커밋됐든 안 됐든 **그 시점과 지금 작업트리의 차이**를 준다.
 */
function touchedTests(worktree, baseSha) {
  const changed = sh('git', ['diff', '--name-only', baseSha], { cwd: worktree })
    .split('\n').filter(Boolean).filter(isTest);
  const created = sh('git', ['ls-files', '--others', '--exclude-standard'], { cwd: worktree })
    .split('\n').filter(Boolean).filter(isTest);
  return [...new Set([...changed, ...created])];
}

/**
 * 테스트를 클로드가 쓴 그 시점으로 되돌린다.
 *
 * 원래 있던 것은 그 시점 내용으로, 그 시점에 없던 것은 지운다. 코더가 커밋해 뒀더라도
 * 파일 내용이 되돌아가므로 다음 판정은 되돌린 상태로 이뤄진다.
 */
function restoreTests(worktree, baseSha) {
  const base = sh('git', ['ls-tree', '-r', '--name-only', baseSha], { cwd: worktree })
    .split('\n').filter(Boolean).filter(isTest);
  for (const p of base) {
    sh('git', ['checkout', baseSha, '--', p], { cwd: worktree, stdio: 'pipe' });
  }
  const now = sh('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: worktree })
    .split('\n').filter(Boolean).filter(isTest);
  for (const p of now.filter((x) => !base.includes(x))) {
    rmSync(join(worktree, p), { force: true, recursive: true });
    // 코더가 커밋해 색인에 올라가 있을 수 있다.
    try { sh('git', ['rm', '--cached', '-q', '-f', p], { cwd: worktree, stdio: 'pipe' }); } catch { /* 색인에 없으면 그만 */ }
  }
}

/**
 * 지금 파일들의 **내용**을 경로별로 — 누가 무엇을 고쳤는지 보려고.
 *
 * 이름만 비교하면 **기존 파일을 고친 것을 놓친다.** 새로 만든 것만 잡히고, 이미 있던
 * 파일의 내용이 바뀐 것은 그대로 지나간다.
 */
function snapshot(worktree, pick) {
  const out = new Map();
  for (const p of sh('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: worktree })
    .split('\n').filter(Boolean).filter(pick)) {
    try { out.set(p, readFileSync(join(worktree, p), 'utf8')); } catch { out.set(p, ''); }
  }
  return out;
}

/**
 * 초록 뒤 클로드가 구현을 읽고 판단한다.
 *
 * **테스트가 통과했다고 좋은 코드는 아니다.** 테스트만 겨우 통과하는 껍데기, 스펙에 없는
 * 짓, 남의 자리를 건드린 것은 게이트가 못 잡는다. 사람이 아침에 보기 전에 한 번 거른다.
 *
 * @returns 문제가 있으면 그 내용, 괜찮으면 null.
 */
function review(worktree, spec) {
  const out = join(tmpdir(), `pipeline-review-${Date.now()}.txt`);
  claude(worktree, [
    '코더가 구현을 마쳤고 테스트가 통과했습니다. **구현을 읽고 검수하세요.**',
    '',
    '## 무엇을 보나',
    '- 스펙대로인가 — 빠뜨린 것, 스펙에 없는데 넣은 것',
    '- **테스트만 겨우 통과하는 코드가 아닌가** (특정 입력에만 맞춘 분기 등)',
    '- 스펙 범위 밖 파일을 건드리지 않았나',
    '- 경계·예외에서 실제로 옳은가 — 테스트가 놓친 자리',
    '',
    '## 어떻게 답하나',
    `문제가 **없으면** \`${out}\` 파일에 \`OK\` 한 줄만 쓰세요.`,
    `문제가 **있으면** 같은 파일에 무엇이 왜 문제인지, 어떻게 고쳐야 하는지 적으세요.`,
    '코더가 그 글을 그대로 받아 고칩니다 — 코더에게 말하듯 쓰세요.',
    '',
    '**구현을 직접 고치지 마세요.** 고치는 것은 코더 몫입니다.',
    '',
    '## 스펙',
    spec,
  ].join('\n'));
  let text = '';
  try { text = readFileSync(out, 'utf8').trim(); } catch { /* 안 썼으면 통과로 본다 */ }
  rmSync(out, { force: true });
  return !text || /^OK$/im.test(text.split('\n')[0]) ? null : text;
}

/**
 * 본체가 건드려졌는지 본다 — 뚫렸으면 **그 자리에서** 멈춘다.
 *
 * 워크트리 격리는 약속이 아니라 확인이어야 한다. 실제로 뚫린 적이 있다.
 */
function assertRepoClean(before, who) {
  const after = sh('git', ['status', '--porcelain'], { cwd: REPO });
  if (after !== before) {
    die(`${who} 가 본체 저장소(${REPO})를 건드렸습니다. 격리가 뚫렸습니다.\n${after}`);
  }
}

/** 워크트리 안에서만 돌게 하고, 끝나면 본체가 깨끗한지 본다. */
function runAgent(cmd, args, who, worktree) {
  const before = sh('git', ['status', '--porcelain'], { cwd: REPO });
  try {
    // 출력을 삼키지 않는다 — 삼켰더니 "아무것도 안 만들어졌다" 는 결과만 남고 왜인지
    // 알 수 없었다(coder.mjs 의 교훈).
    sh(cmd, args, { cwd: worktree, stdio: ['ignore', 'inherit', 'inherit'] });
  } catch (e) {
    // **아무것도 안 남기고 죽지 않는다** (#283). 예전엔 여기서 die() 로 끝나 이슈도
    // 덧글도 push 도 없었다 — 코더 모델이 은퇴한 동안 야간 러너가 매일 밤 1회차에서
    // 죽었고 흔적은 systemd 로그뿐이었다. 12회 소진 경로가 하는 것을 똑같이 한다.
    salvage({ kind: StuckKind.AGENT_FAILED, who, output: `${e?.message ?? e}` });
  }
  assertRepoClean(before, who);
}

/**
 * 클로드 — 워크트리 안에서만 쓴다.
 *
 * **`--permission-mode dontAsk` 만으로는 못 쓴다.** "묻지 않는다" 일 뿐 "허용한다" 가
 * 아니라서, 허용 목록에 없는 도구는 묻지 않고 **거부**된다. 첫 시험에서 클로드가 테스트를
 * 다 써 놓고도 파일로 저장하지 못해 채팅 출력만 남기고 끝났다 — 쓰기 도구를 명시한다.
 *
 * `--add-dir` 로 워크트리만 준다. 본체는 주지 않고, 끝난 뒤 `assertRepoClean` 이 확인한다.
 */
function claude(worktree, message) {
  runAgent('claude', [
    '-p', message,
    '--add-dir', worktree,
    // 검수 결과를 /tmp 에 적어야 해서 워크트리 밖 쓰기도 필요하다. 본체를 건드렸는지는
    // 매 호출 뒤 assertRepoClean 이 확인하므로 격리는 그대로다.
    '--allowedTools', 'Read', 'Grep', 'Glob', 'Write', 'Edit', 'Bash',
    '--permission-mode', 'acceptEdits',
  ], '클로드', worktree);
}

/** 코더 — opencode. `--dir` 를 반드시 준다(cwd 만으로는 탈출한다). */
function coder(worktree, message, cont) {
  runAgent('opencode', [
    'run', '--dir', worktree, '-m', CODER_MODEL, ...(cont ? ['-c'] : []), message,
  ], '코더', worktree);
}

/**
 * 지금까지 잰 것. 막히면 그대로 보고에 실린다.
 *
 * 아직 못 잰 것은 `null` 로 둔다 — 1회차에서 에이전트가 죽으면 빨강도 테스트도 없다.
 * 예전 보고 코드는 `red.counts.numTotalTests` 를 그대로 읽어 **바로 그 자리에서 다시
 * 터졌다**(#283).
 */
const 상황 = { testFiles: [], redCount: null, round: 0, verdict: null, output: '' };

/**
 * 막혔을 때 남길 것을 **한 곳에서** (#283).
 *
 * 브랜치 push → 스레드 덧글 → 이슈 생성. 예전엔 이 셋이 12회 소진 경로에만 있었고,
 * 에이전트 호출이 실패하는 경우엔 안 붙어 있었다. 이제 둘 다 여기를 부른다.
 *
 * 문구는 `rescue.mjs` 가 만든다 — 부수효과와 섞여 있으면 시험할 수 없다.
 * **여기서 프로세스가 끝난다**(exit 2).
 */
function salvage({ kind, who, output }) {
  log(kind === StuckKind.AGENT_FAILED
    ? `${who} 실행이 실패했습니다 — 브랜치를 올리고 이슈를 만듭니다`
    : `${MAX_ROUNDS}회를 다 썼습니다 — 브랜치를 올리고 이슈를 만듭니다`);

  // 1) 지금까지의 작업을 브랜치로. **버리지 않는다.** 담을 것이 없어도 계속 간다.
  try {
    sh('git', ['add', '-A'], { cwd: worktree, stdio: 'pipe' });
    sh('git', ['commit', '-q', '-m', `pipeline(미완): ${spec.split('\n')[0].slice(0, 60)}`], {
      cwd: worktree, stdio: 'pipe',
    });
  } catch { /* 담을 것이 없다 — 스펙 커밋만 있는 상태일 수 있다 */ }
  let pushed = false;
  try {
    sh('git', ['push', '-q', '-u', 'origin', branch], { cwd: worktree, stdio: 'pipe' });
    pushed = true;
  } catch { log('   브랜치 push 에 실패했습니다.'); }

  const info = {
    kind, who, spec, maxRounds: MAX_ROUNDS, ...상황,
    branch: pushed ? branch : null,
    // 지울 워크트리 경로를 적어 봐야 이어받을 수 없다.
    worktree: keep ? worktree : null,
    output: output || 상황.output,
  };

  // 2) **스레드에 알린다** (#279). 이슈만 만들면 사람이 아침에 그걸 볼 이유가 없다.
  if (POST_ID) {
    try {
      sh(join(REPO, 'scripts/ai-team/api.sh'), ['comment', POST_ID, 'claude', stuckComment(info)], { stdio: 'pipe' });
      log('   스레드에 알렸습니다');
    } catch {
      log('   스레드 알림에 실패했습니다 — 이슈는 남습니다.');
    }
  }

  // 3) 이슈 — 나중에 이어받을 사람이 읽는다.
  try {
    const url = sh('gh', ['issue', 'create',
      '--title', stuckTitle(kind, spec), '--body', stuckIssueBody(info)], { cwd: REPO }).trim();
    log(`   이슈: ${url}`);
  } catch {
    log('   이슈 생성에 실패했습니다 — 브랜치는 올라가 있습니다.');
  }

  if (!keep) {
    try { sh('git', ['worktree', 'remove', '--force', worktree], { cwd: REPO, stdio: 'pipe' }); } catch { /* 이미 없다 */ }
  }
  process.exit(2);
}

// ── 시작 ────────────────────────────────────────────────────────────────

const specPath = arg('spec', null);
if (!specPath || !existsSync(specPath)) {
  die('사용법: pipeline.mjs --spec <스펙파일> [--post <postId>] [--keep]');
}
const spec = readFileSync(specPath, 'utf8');
const keep = process.argv.includes('--keep');
// 막혔을 때 알릴 스레드. 없으면 알리지 않는다(손으로 돌릴 때).
const POST_ID = arg('post', '');

const stamp = Date.now();
const worktree = resolve(arg('worktree', mkdtempSync(join(tmpdir(), `ai-pipeline-${stamp}-`))));
const branch = arg('branch', `pipeline/${stamp}`);

if (worktree === resolve(REPO)) die('워크트리가 본체 작업트리와 같습니다.');
if (!process.env.OPENROUTER_API_KEY?.trim()) die('OPENROUTER_API_KEY 가 환경에 없습니다.');

// 1) 워크트리
rmSync(worktree, { recursive: true, force: true });
// **지금 HEAD 에서 갈라낸다** (#284). 'main' 을 못박아 두면 어느 브랜치에서 돌리든 워크트리
// 내용이 main 이라 그 브랜치가 새로 넣은 테스트가 워크트리에 없다 — 자기 자신을 검증하지
// 못한다. 못박고 싶으면 `PIPELINE_BASE=main`.
let headRef = '';
try { headRef = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: REPO }).trim(); } catch { /* 못 읽으면 main */ }
const base = resolveBase({ envBase: process.env.PIPELINE_BASE, headRef });
log(`워크트리 ${worktree} (${branch}) — ${base} 에서 갈라냅니다`);
sh('git', ['worktree', 'add', '-b', branch, worktree, base], { cwd: REPO, stdio: 'pipe' });

// 갓 만든 워크트리엔 node_modules 가 없어 vitest 가 아예 못 돈다. 재설치는 수 분이라
// 본체 것을 가리킨다 — 같은 커밋의 같은 package.json 이다.
const wtModules = join(worktree, 'webapp/node_modules');
if (!existsSync(wtModules)) {
  sh('ln', ['-s', join(REPO, 'webapp/node_modules'), wtModules], { stdio: 'pipe' });
}

// 저장소 훅(.claude/hooks/check-src-edit.sh)이 **마지막 워크플로 커밋이 `spec:` 이 아니면**
// webapp/ 편집을 거부한다. 워크트리에도 .claude/settings.json 이 그대로 체크아웃되므로 훅이
// 살아 있다. 첫 시험에서 클로드가 스스로 우회를 찾아냈는데, 그걸 매번 알아서 하기를 기대할
// 수는 없다 — **파이프라인이 직접 스펙 커밋을 남긴다.**
const specDir = join(worktree, 'docs/spec');
sh('mkdir', ['-p', specDir], { stdio: 'pipe' });
writeFileSync(join(specDir, `pipeline-${stamp}.md`), spec, 'utf8');
sh('git', ['add', 'docs/spec'], { cwd: worktree, stdio: 'pipe' });
sh('git', ['commit', '-q', '-m', `spec: ${spec.split('\n')[0].replace(/^#\s*/, '').slice(0, 60)}`], {
  cwd: worktree, stdio: 'pipe',
});
log('   스펙 커밋 남김 (편집 훅 통과용)');

// 2) 클로드 — 껍데기와 테스트. **구현은 쓰지 않는다.**
log('1단계: 클로드가 테스트를 씁니다');
claude(worktree, [
  spec, '',
  '## 지금 단계에서 할 일',
  '**실패하는 테스트**와, 그 테스트가 부를 수 있을 만큼의 **껍데기**만 쓰세요.',
  '- 껍데기는 시그니처만입니다. 알맹이는 코더가 채웁니다 — 채우지 마세요.',
  '- 해피 케이스보다 **엣지 케이스를 많이** 쓰세요. 경계·빈 값·예외·되돌리기.',
  '- 기존 테스트의 관행(파일 위치·환경 지정·작성 방식)을 먼저 보고 따르세요.',
  '- 이 테스트는 **당신 것이고 책임도 당신 것**입니다. 코더는 손대지 못합니다.',
].join('\n'));

const afterWrite = changedPaths(worktree);
const testFiles = afterWrite.filter((f) => isTest(f.path)).map((f) => f.path);
if (!testFiles.length) die('테스트 파일이 만들어지지 않았습니다.');
log(`   테스트 ${testFiles.length}건: ${testFiles.join(', ')}`);
상황.testFiles = testFiles;

const specTests = testFiles.map((p) => p.replace(/^webapp\//, ''));

// **테스트를 커밋한다.** 이게 "테스트는 코더 것이 아니다" 를 강제하는 유일한 방법이다.
//
// 커밋하지 않으면 테스트 파일이 끝까지 untracked(`??`) 로 남는다. 그러면
//   - 코더가 통째로 덮어써도 status 가 여전히 `??` 라 **바뀐 것을 못 알아채고**
//   - `git checkout --` 는 추적 중인 파일만 되돌리므로 **되돌리지도 못한다**(실측 확인)
// 첫 성공 실행에서 이 규칙이 실제로는 걸리지 않고 있었다.
//
// 덤으로 "이 테스트는 클로드가 썼다" 가 히스토리에 남는다.
sh('git', ['add', '-A'], { cwd: worktree, stdio: 'pipe' });
sh('git', ['commit', '-q', '-m', `test: ${spec.split('\n')[0].replace(/^#\s*/, '').slice(0, 60)}`], {
  cwd: worktree, stdio: 'pipe',
});
let TEST_SHA = sh('git', ['rev-parse', 'HEAD'], { cwd: worktree }).trim();
log('   테스트 커밋 — 이제부터 코더가 만지면 잡힌다');

// 3) 빨강 게이트 — 구현 없이 **정말** 실패하는가.
const red = runTests(worktree, specTests);
const redVerdict = redGate(red.counts);
if (redVerdict !== GateVerdict.PASS) {
  console.error(red.output.slice(-2000));
  die(`빨강 게이트 실패(${redVerdict}). 작업 공간을 남깁니다: ${worktree}`);
}
log(`   빨강 확인 ✓ (${red.counts.numTotalTests}건 모두 실패)`);
상황.redCount = red.counts.numTotalTests;
const redFile = `/tmp/ai-pipeline-${stamp}-RED.txt`;
writeFileSync(redFile, red.output, 'utf8');

// 4~6) 코더가 채우고, 막히면 클로드가 붙어 논의한다.
let round = 0;
let green = null;
let verdict = null;
let 검수 = null;

while (round < MAX_ROUNDS) {
  round++;
  상황.round = round;
  log(`${round}회차: 코더가 구현합니다`);
  coder(worktree, round === 1
    ? [
      '이제 방금 쓴 테스트가 통과하도록 **구현**하세요.',
      '- **테스트 파일은 절대 수정하지 마세요.** 고치면 그 회차는 무효입니다.',
      '- 스펙 범위 밖의 파일은 건드리지 마세요.',
    ].join('\n')
    : [
      round === 2 || !검수 ? '아직 통과하지 않습니다. 아래를 보고 **구현만** 고치세요.'
        : '테스트는 통과했지만 검수에서 걸렸습니다. 아래를 보고 **구현만** 고치세요.',
      '- **테스트 파일은 절대 수정하지 마세요.**',
      '',
      (검수 || green.output).slice(-3000),
    ].join('\n'), round > 1);

  // 코더가 테스트를 만졌으면 되돌린다. **조용히 넘어가지 않는다.**
  const touched = touchedTests(worktree, TEST_SHA);
  if (touched.length) {
    log(`   코더가 테스트를 만졌습니다 — 되돌립니다: ${touched.join(', ')}`);
    restoreTests(worktree, TEST_SHA);
  }

  // 루프 중에는 **해당 스펙 테스트만** 돈다. 전체는 수백 개라 12회를 못 버틴다.
  green = runTests(worktree, specTests);
  verdict = greenGate(green.counts, touched);
  검수 = null;
  상황.verdict = verdict;
  상황.output = green.output;

  if (verdict !== GateVerdict.PASS) {
    // **클로드가 판단한다** — 구현이 틀렸나, 테스트가 틀렸나.
    //
    // 테스트는 클로드 것이고 책임도 클로드에게 있다. 코더에게 "테스트가 틀렸다" 고
    // 넘기면 코더가 테스트를 고치려 들고, 그건 이 프로세스가 막는 바로 그 일이다.
    log('   실패 — 클로드가 원인을 봅니다');
    // 클로드 턴 **전**의 내용을 담아 둔다. 이름이 아니라 내용이어야 기존 파일을 고친
    // 것까지 잡힌다.
    const 테스트전 = snapshot(worktree, isTest);
    const 구현전 = snapshot(worktree, isImpl);
    claude(worktree, [
      '구현이 테스트를 통과하지 못합니다. 실패 출력을 보고 **원인이 어디인지** 판단하세요.',
      '',
      '- **테스트가 틀렸다면 당신이 고치세요.** 테스트는 당신 것이고 책임도 당신입니다.',
      '  스펙을 잘못 읽었거나, 단언이 스펙과 다르거나, 경계를 잘못 잡은 경우입니다.',
      '- **구현이 틀렸다면 아무것도 고치지 마세요.** 다음 회차에 코더가 고칩니다.',
      '  구현 파일은 건드리지 마세요 — 그건 코더 몫입니다.',
      '',
      '판단이 서지 않으면 **고치지 마세요.** 멀쩡한 테스트를 구현에 맞춰 무르는 것이',
      '가장 나쁜 결과입니다.',
      '',
      green.output.slice(-3000),
    ].join('\n'));

    // **클로드가 구현을 만졌으면 되돌린다.**
    //
    // 코더가 테스트를 만지는 것은 기계로 막으면서 이쪽은 프롬프트로만 막으면 비대칭이다.
    // 구현은 코더 몫이고, 클로드가 손대면 "코더가 스펙대로 만들었나" 를 잴 수 없게 된다.
    const 되돌릴것 = revertPlan(구현전, snapshot(worktree, isImpl));
    if (되돌릴것.length) {
      log(`   클로드가 구현을 만졌습니다 — 되돌립니다: ${되돌릴것.map((x) => x.path).join(', ')}`);
      for (const { path, content } of 되돌릴것) {
        if (content === null) rmSync(join(worktree, path), { force: true, recursive: true });
        else writeFileSync(join(worktree, path), content, 'utf8');
      }
    }

    // 클로드가 테스트를 고쳤으면 그 시점을 새 기준으로 삼는다 — 안 그러면 다음 회차에
    // 그 수정이 "코더가 만진 것" 으로 잡혀 되돌아간다.
    //
    // **테스트만 담는다.** `-A` 로 쓸어 담으면 코더가 만들던 구현까지 들어가, 커밋
    // 메시지는 "테스트를 고침" 인데 내용은 다른 것이 된다.
    if (needsRebaseline(테스트전, snapshot(worktree, isTest))) {
      const 지금테스트 = sh('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: worktree })
        .split('\n').filter(Boolean).filter(isTest);
      sh('git', ['add', '--', ...지금테스트], { cwd: worktree, stdio: 'pipe' });
      sh('git', ['commit', '-q', '-m', `test: ${round}회차 — 클로드가 테스트를 고침`], {
        cwd: worktree, stdio: 'pipe',
      });
      TEST_SHA = sh('git', ['rev-parse', 'HEAD'], { cwd: worktree }).trim();
      log('   클로드가 테스트를 고쳤습니다 — 기준을 새로 잡습니다');
    }
    continue;
  }

  // 초록이다. 그런데 **테스트만 통과하는 코드일 수 있다** — 클로드가 읽고 판단한다.
  log('   초록 — 클로드가 구현을 검수합니다');
  검수 = review(worktree, spec);
  if (검수 === null) { log(`   검수 통과 ✓ (${round}회차)`); break; }
  log('   검수에서 걸렸습니다');
  verdict = 'REVIEW_REJECTED';
  상황.verdict = verdict;
  상황.output = 검수;
}

if (verdict !== GateVerdict.PASS) {
  // 7) 12회를 다 썼다. **버리지 않는다** — 브랜치를 올리고 이슈를 만들어 이어받게 한다.
  //
  //    에이전트 호출이 실패한 경우와 **같은 경로**를 쓴다 (#283). 예전엔 이쪽에만 안전망이
  //    붙어 있어서, 호출 자체가 실패하면 아무것도 안 남고 끝났다.
  salvage({ kind: StuckKind.ROUNDS_EXHAUSTED, output: 검수 || green.output });
}

log(`   초록 확인 ✓ (${round}회차)`);

// 8) 전체 스위트 — 초록이 뜬 뒤 **한 번만**. 남의 것을 깨뜨리지 않았는지 본다.
log('전체 스위트 확인');
const whole = runTests(worktree, []);
const wholeVerdict = greenGate(whole.counts, []);
if (wholeVerdict !== GateVerdict.PASS) {
  console.error(whole.output.slice(-3000));
  die(`전체가 통과하지 않습니다(${wholeVerdict}). 작업 공간을 남깁니다: ${worktree}`);
}
log(`   전체 확인 ✓ (${whole.counts.numTotalTests}건)`);

// 9) 커밋 → push. **PR·머지는 하지 않는다** — 브랜치는 검수 대상이지 반영이 아니다.
sh('git', ['add', '-A'], { cwd: worktree, stdio: 'pipe' });
sh('git', ['commit', '-q', '-m', `pipeline: ${spec.split('\n')[0].slice(0, 72)}`], {
  cwd: worktree, stdio: 'pipe',
});
sh('git', ['push', '-q', '-u', 'origin', branch], { cwd: worktree, stdio: 'pipe' });
const sha = sh('git', ['rev-parse', '--short', 'HEAD'], { cwd: worktree }).trim();

// **성공도 스레드에 알린다** (#292). 야간 클로드는 이제 요청만 남기고 먼저 끝나므로
// 결과를 볼 수 없다 — 파이프라인이 직접 알리지 않으면 아침에 아무도 모른다.
if (POST_ID) {
  try {
    sh(join(REPO, 'scripts/ai-team/api.sh'), ['comment', POST_ID, 'claude', successComment({
      branch, sha, testFiles,
      redCount: red.counts?.numTotalTests ?? null,
      round,
      wholeCount: whole.counts?.numTotalTests ?? null,
    })], { stdio: 'pipe' });
    log('   스레드에 알렸습니다');
  } catch {
    log('   스레드 알림에 실패했습니다 — 브랜치는 올라가 있습니다.');
  }
}

log(`완료 — ${branch} (${sha}) · 빨강 증거 ${redFile}`);
if (!keep) sh('git', ['worktree', 'remove', '--force', worktree], { cwd: REPO, stdio: 'pipe' });
