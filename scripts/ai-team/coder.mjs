#!/usr/bin/env node
// AI 코더 하네스 (#224).
//
// ── 역할 분담 ───────────────────────────────────────────────────────────
//
// **편집은 검증된 도구(opencode)가, TDD 강제는 이 스크립트가 한다.**
//
// 처음엔 모델을 직접 불러 파일을 통째로 받는 방식으로 만들었다. 동작은 했지만 에이전트
// 루프가 없어서, 모델이 첫 시도에 못 맞히면 그냥 실패했다. opencode 로 바꾸니 저장소를
// 먼저 둘러보고(Glob·Read) **기존 테스트 관행을 학습한 뒤** 쓴다 — 손으로 만든 단발
// 호출로는 안 되는 일이다.
//
// 반대로 **기성 도구 중 "테스트를 먼저 적용해 실패를 확인한 뒤 구현하라"를 강제하는 것은
// 없다.** aider 의 --auto-test 도 "고친 다음 테스트"지 순서 강제가 아니다.
// docs/development.md 가 요구하는 TDD 는 거기서 나오지 않는다. 그래서 게이트는 우리 것이다.
//
// ── 게이트 ──────────────────────────────────────────────────────────────
//
//   1단계  테스트만 쓰게 한다 → 돌린다 → **반드시 실패해야 한다**
//          (구현이 딸려 왔으면 되돌린 뒤 잰다. 그래야 "구현 없이 실패하는가"를 재는 것이 된다)
//   2단계  --continue 로 구현하게 한다 → 전체를 돌린다 → **반드시 통과해야 한다**
//
// 코더가 TDD 를 건너뛸 방법이 없다. 빨강 출력은 RED.txt 로 남겨 PR 본문에 붙인다.
//
// ── 왜 워크트리인가 ─────────────────────────────────────────────────────
//
// `~/site` 의 작업트리는 **실서비스가 그대로 읽는다**(webapp/public/). 거기 쓰면 검증 전
// 코드가 라이브가 된다 — 실제로 겪었다. 그래서 별도 워크트리에서만 쓴다.
//
// 사용:
//   node coder.mjs --spec spec.md [--worktree <경로>] [--branch <이름>]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO = '/home/seungrye/site';
const DEFAULT_MODEL = 'openrouter/stealth/ox-alpha';

const die = (m) => { console.error(`[coder] ${m}`); process.exit(1); };
const log = (m) => console.log(`[coder] ${m}`);

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });

/** 테스트를 돌리고 {ok, output}. 실패해도 던지지 않는다 — 실패가 정상인 단계가 있다. */
function runTests(worktree, paths) {
  try {
    return { ok: true, output: sh('pnpm', ['vitest', 'run', ...paths], {
      cwd: join(worktree, 'webapp'), stdio: 'pipe',
    }) };
  } catch (e) {
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/** git status 로 바뀐 경로들. `??`(신규)과 수정 둘 다. */
function changedPaths(worktree) {
  return sh('git', ['status', '--porcelain'], { cwd: worktree })
    .split('\n')
    .filter(Boolean)
    .map((l) => ({ status: l.slice(0, 2).trim(), path: l.slice(3).trim() }));
}

const isTest = (p) => /\.test\.(ts|tsx)$/.test(p);

/**
 * 본체 저장소가 건드려졌는지 본다 — 뚫렸을 때 **그 자리에서** 알아야 한다.
 *
 * 실제로 뚫린 적이 있다. `cwd` 만 워크트리로 주고 돌렸더니 opencode 가 `~/site` 에 파일을
 * 썼다. 워크트리의 `.git` 은 `gitdir: ~/site/.git/worktrees/...` 라고 적힌 **파일**이라,
 * 프로젝트 루트를 찾아 거슬러 올라가면 본체가 나온다. `--dir` 로 고정해 막았지만,
 * 도구가 바뀌면 또 그럴 수 있으므로 매번 확인한다.
 */
function assertRepoClean(before) {
  const now = sh('git', ['status', '--porcelain'], { cwd: REPO });
  if (now !== before) {
    console.error(`[coder] 이전:\n${before}\n[coder] 지금:\n${now}`);
    die(`본체 저장소(${REPO})가 변경됐습니다. 격리가 뚫렸습니다 — 중단합니다.`);
  }
}

/**
 * opencode 를 워크트리 안에서 헤드리스로 한 번 돌린다.
 *
 * `--dir` 이 핵심이다. `cwd` 만으로는 워크트리 밖으로 나간다(위 주석 참고).
 * 출력은 **반드시 보여 준다** — 삼켰더니 "테스트가 안 만들어졌다"는 결과만 남고
 * 왜 그런지 알 길이 없었다.
 */
function opencode(worktree, model, message, cont) {
  const args = ['run', '--dir', worktree, '-m', model, ...(cont ? ['-c'] : []), message];
  const repoBefore = sh('git', ['status', '--porcelain'], { cwd: REPO });
  let out;
  try {
    out = sh('opencode', args, { cwd: worktree, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    console.error(`${e.stdout ?? ''}${e.stderr ?? ''}`.slice(-3000));
    die('opencode 실행이 실패했습니다 (위 출력 참고).');
  }
  process.stdout.write(out.slice(-4000));
  assertRepoClean(repoBefore);
  return out;
}

// ── 본문 ────────────────────────────────────────────────────────────────

const specPath = arg('spec') ?? die('--spec <파일> 이 필요합니다.');
const worktree = resolve(arg('worktree', '/home/seungrye/site-coder'));
const branch = arg('branch', `coder/${Date.now()}`);
const model = process.env.AI_CODER_MODEL?.trim() || DEFAULT_MODEL;

if (worktree === resolve(REPO)) die('워크트리가 실서비스 작업트리와 같습니다.');
if (!process.env.OPENROUTER_API_KEY?.trim()) die('OPENROUTER_API_KEY 가 환경에 없습니다.');

const spec = readFileSync(specPath, 'utf8');

// 1) 워크트리 준비
if (!existsSync(worktree)) {
  log(`워크트리 생성: ${worktree} (${branch})`);
  sh('git', ['worktree', 'add', '-b', branch, worktree, 'main'], { cwd: REPO, stdio: 'pipe' });
} else {
  log(`워크트리 재사용: ${worktree}`);
}
// 갓 만든 워크트리에는 node_modules 가 없어 vitest 가 아예 못 돈다. 재설치는 수 분이라
// 본체 것을 가리킨다 — 같은 커밋의 같은 package.json 이다.
const wtModules = join(worktree, 'webapp/node_modules');
if (!existsSync(wtModules)) {
  log('node_modules 를 본체로 연결합니다');
  sh('ln', ['-s', join(REPO, 'webapp/node_modules'), wtModules], { stdio: 'pipe' });
}

if (changedPaths(worktree).length) {
  die('워크트리가 깨끗하지 않습니다. 이전 작업을 정리하거나 커밋한 뒤 다시 실행하세요.');
}

// 2) 1단계 — 테스트만.
log(`1단계: 실패하는 테스트 작성 (${model})`);
opencode(worktree, model,
  [spec, '',
   '## 지금 단계에서 할 일',
   '**실패하는 테스트만** 작성하세요. 구현은 다음 단계입니다.',
   '- 구현 파일을 만들거나 고치지 마세요. 이 단계에서 테스트는 반드시 실패해야 합니다.',
   '- 기존 테스트의 관행(파일 위치·환경 지정·작성 방식)을 먼저 확인하고 따르세요.',
  ].join('\n'), false);

const afterRed = changedPaths(worktree);
const testFiles = afterRed.filter((f) => isTest(f.path)).map((f) => f.path);
const strays = afterRed.filter((f) => !isTest(f.path));

if (!testFiles.length) die('테스트 파일이 만들어지지 않았습니다. TDD 를 건너뛴 배치는 받지 않습니다.');
log(`   테스트 ${testFiles.length}건: ${testFiles.join(', ')}`);

// 구현이 딸려 왔으면 되돌린다. 그래야 "구현 없이도 실패하는가"를 재는 것이 된다.
if (strays.length) {
  log(`   구현이 함께 왔습니다 — 빨강을 재기 위해 되돌립니다: ${strays.map((f) => f.path).join(', ')}`);
  for (const f of strays) {
    if (f.status === '??') rmSync(join(worktree, f.path), { force: true, recursive: true });
    else sh('git', ['checkout', '--', f.path], { cwd: worktree, stdio: 'pipe' });
  }
}

// 3) 빨강 게이트
const red = runTests(worktree, testFiles.map((p) => p.replace(/^webapp\//, '')));
if (red.ok) {
  console.error(red.output.slice(-2000));
  die('구현 없이도 테스트가 통과했습니다 — 아무것도 잡지 못하는 테스트입니다. 거부합니다.');
}
log('   빨강 확인 ✓');
writeFileSync(join(worktree, 'RED.txt'), red.output, 'utf8');

// 4) 2단계 — 구현.
log('2단계: 통과하도록 구현');
opencode(worktree, model,
  ['이제 방금 쓴 테스트가 통과하도록 구현하세요.',
   '- **테스트 파일은 수정하지 마세요.** 구현으로 통과시켜야 합니다.',
   '- 스펙 범위 밖의 파일은 건드리지 마세요.',
  ].join('\n'), true);

// 5) 초록 게이트 — 전체 스위트.
log('   전체 스위트 확인');
const green = runTests(worktree, []);
if (!green.ok) {
  console.error(green.output.slice(-3000));
  die('구현을 적용해도 전체가 통과하지 않습니다. 워크트리를 남겨 두니 확인하세요.');
}
log('   초록 확인 ✓');

// 6) 커밋만. 푸시·PR·머지는 사람 검수 뒤의 일이다.
sh('git', ['add', '-A'], { cwd: worktree, stdio: 'pipe' });
sh('git', ['commit', '-q', '-m', `coder: ${spec.split('\n')[0].slice(0, 72)}`], {
  cwd: worktree, stdio: 'pipe',
});
const sha = sh('git', ['rev-parse', '--short', 'HEAD'], { cwd: worktree }).trim();

log('');
log(`완료 — ${worktree} 의 ${branch} 에 ${sha} 커밋`);
log(`빨강 출력은 ${join(worktree, 'RED.txt')} 에 남겼습니다 (PR 본문에 붙이세요).`);
log('푸시·PR 은 하지 않았습니다.');
