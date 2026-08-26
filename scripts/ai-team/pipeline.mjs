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

const REPO = '/home/seungrye/site';
const CODER_MODEL = process.env.AI_CODER_MODEL?.trim() || 'openrouter/stealth/ox-alpha';

/** 논의 루프 상한. 넘으면 브랜치를 올리고 이슈를 만든 뒤 덧글로 넘긴다. */
const MAX_ROUNDS = 12;

const log = (m) => console.log(`\x1b[1;36m[pipeline]\x1b[0m ${m}`);
const die = (m) => { console.error(`\x1b[1;31m[pipeline]\x1b[0m ${m}`); process.exit(1); };

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });

const isTest = (p) => /\.test\.(ts|tsx)$/.test(p);

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** git status 로 바뀐 경로들. `??`(신규)과 수정 둘 다. */
function changedPaths(worktree) {
  return sh('git', ['status', '--porcelain'], { cwd: worktree })
    .split('\n')
    .filter(Boolean)
    .map((l) => ({ status: l.slice(0, 2).trim(), path: l.slice(3).trim() }));
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
  } catch {
    die(`${who} 실행이 실패했습니다 (위 출력 참고).`);
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
    '--allowedTools', 'Read', 'Grep', 'Glob', 'Write', 'Edit',
    '--permission-mode', 'acceptEdits',
  ], '클로드', worktree);
}

/** 코더 — opencode. `--dir` 를 반드시 준다(cwd 만으로는 탈출한다). */
function coder(worktree, message, cont) {
  runAgent('opencode', [
    'run', '--dir', worktree, '-m', CODER_MODEL, ...(cont ? ['-c'] : []), message,
  ], '코더', worktree);
}

// ── 시작 ────────────────────────────────────────────────────────────────

const specPath = arg('spec', null);
if (!specPath || !existsSync(specPath)) die('사용법: pipeline.mjs --spec <스펙파일> [--keep]');
const spec = readFileSync(specPath, 'utf8');
const keep = process.argv.includes('--keep');

const stamp = Date.now();
const worktree = resolve(arg('worktree', mkdtempSync(join(tmpdir(), `ai-pipeline-${stamp}-`))));
const branch = arg('branch', `pipeline/${stamp}`);

if (worktree === resolve(REPO)) die('워크트리가 본체 작업트리와 같습니다.');
if (!process.env.OPENROUTER_API_KEY?.trim()) die('OPENROUTER_API_KEY 가 환경에 없습니다.');

// 1) 워크트리
rmSync(worktree, { recursive: true, force: true });
log(`워크트리 ${worktree} (${branch})`);
sh('git', ['worktree', 'add', '-b', branch, worktree, 'main'], { cwd: REPO, stdio: 'pipe' });

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
log('   테스트 커밋 — 이제부터 코더가 만지면 잡힌다');

// 3) 빨강 게이트 — 구현 없이 **정말** 실패하는가.
const red = runTests(worktree, specTests);
const redVerdict = redGate(red.counts);
if (redVerdict !== GateVerdict.PASS) {
  console.error(red.output.slice(-2000));
  die(`빨강 게이트 실패(${redVerdict}). 작업 공간을 남깁니다: ${worktree}`);
}
log(`   빨강 확인 ✓ (${red.counts.numTotalTests}건 모두 실패)`);
const redFile = `/tmp/ai-pipeline-${stamp}-RED.txt`;
writeFileSync(redFile, red.output, 'utf8');

// 4~6) 코더가 채우고, 막히면 클로드가 붙어 논의한다.
let round = 0;
let green = null;
let verdict = null;

while (round < MAX_ROUNDS) {
  round++;
  log(`${round}회차: 코더가 구현합니다`);
  coder(worktree, round === 1
    ? [
      '이제 방금 쓴 테스트가 통과하도록 **구현**하세요.',
      '- **테스트 파일은 절대 수정하지 마세요.** 고치면 그 회차는 무효입니다.',
      '- 스펙 범위 밖의 파일은 건드리지 마세요.',
    ].join('\n')
    : [
      '아직 통과하지 않습니다. 아래를 보고 **구현만** 고치세요.',
      '- **테스트 파일은 절대 수정하지 마세요.**',
      '',
      green.output.slice(-3000),
    ].join('\n'), round > 1);

  // 코더가 테스트를 고쳤으면 되돌린다. **조용히 넘어가지 않는다.**
  // 커밋해 뒀으므로 코더가 만지면 ` M` 으로 온다. 새로 만든 테스트(`??`)도 잡는다 —
  // 코더는 테스트를 **고치지도 만들지도** 못한다.
  const touched = changedPaths(worktree)
    .filter((f) => isTest(f.path))
    .map((f) => f.path);
  if (touched.length) {
    log(`   코더가 테스트를 고쳤습니다 — 되돌립니다: ${touched.join(', ')}`);
    for (const f of changedPaths(worktree).filter((x) => isTest(x.path))) {
      // 새로 만든 것은 checkout 으로 못 지운다 — 지워야 한다.
      if (f.status === '??') rmSync(join(worktree, f.path), { force: true, recursive: true });
      else sh('git', ['checkout', '--', f.path], { cwd: worktree, stdio: 'pipe' });
    }
  }

  // 루프 중에는 **해당 스펙 테스트만** 돈다. 전체는 265개 파일이라 12회를 못 버틴다.
  green = runTests(worktree, specTests);
  verdict = greenGate(green.counts, touched);
  if (verdict === GateVerdict.PASS) break;
  log(`   아직입니다 (${verdict})`);
}

if (verdict !== GateVerdict.PASS) {
  // 7) 12회를 다 썼다. **버리지 않는다** — 브랜치를 올리고 이슈를 만들어 이어받게 한다.
  log(`${MAX_ROUNDS}회를 다 썼습니다. 브랜치를 올리고 이슈를 만듭니다`);
  sh('git', ['add', '-A'], { cwd: worktree, stdio: 'pipe' });
  sh('git', ['commit', '-q', '-m', `pipeline(미완): ${spec.split('\n')[0].slice(0, 60)}`], {
    cwd: worktree, stdio: 'pipe',
  });
  sh('git', ['push', '-q', '-u', 'origin', branch], { cwd: worktree, stdio: 'pipe' });

  const body = [
    '## 목적', spec.split('\n').slice(0, 12).join('\n'), '',
    '## 어디까지 갔나',
    `- 브랜치 \`${branch}\` 에 올려 뒀습니다`,
    `- 테스트 ${testFiles.length}건: ${testFiles.join(', ')}`,
    `- 빨강은 통과했습니다(구현 없이 ${red.counts.numTotalTests}건 실패)`,
    `- 구현을 ${MAX_ROUNDS}회 고쳤지만 초록에 못 갔습니다 (${verdict})`, '',
    '## 마지막 실패',
    '```', green.output.slice(-2000), '```', '',
    '## 이어서 하려면',
    `\`git fetch && git checkout ${branch}\` 로 이어받으면 됩니다.`,
    '테스트는 그대로 두고 구현만 고치는 것이 이 프로세스의 규칙입니다.',
  ].join('\n');
  const title = `pipeline 미완: ${spec.split('\n')[0].slice(0, 60)}`;
  try {
    const url = sh('gh', ['issue', 'create', '--title', title, '--body', body], { cwd: REPO }).trim();
    log(`   이슈: ${url}`);
  } catch {
    log('   이슈 생성에 실패했습니다 — 브랜치는 올라가 있습니다.');
  }
  if (!keep) sh('git', ['worktree', 'remove', '--force', worktree], { cwd: REPO, stdio: 'pipe' });
  process.exit(2);
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

log(`완료 — ${branch} (${sha}) · 빨강 증거 ${redFile}`);
if (!keep) sh('git', ['worktree', 'remove', '--force', worktree], { cwd: REPO, stdio: 'pipe' });
