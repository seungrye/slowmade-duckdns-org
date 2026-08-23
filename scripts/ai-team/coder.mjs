#!/usr/bin/env node
// AI 코더 하네스 (#224).
//
// ── 왜 직접 만드나 ──────────────────────────────────────────────────────
//
// 이 호스트에 설치된 에이전트 CLI 는 `claude` 뿐인데, 남의 모델을 받지 않는다:
//   claude --model stealth/ox-alpha        → 모델 이름 화이트리스트에 걸림
//   ANTHROPIC_MODEL=stealth/ox-alpha       → 같은 이유로 거부
// OpenRouter 의 엔드포인트는 멀쩡하다(Anthropic 호환 경로까지 있다). CLI 가 문제다.
//
// ── 왜 도구 루프를 안 만드나 ─────────────────────────────────────────────
//
// 컨텍스트가 1,048,576 이라 관련 파일을 통째로 실어 보낼 수 있다. 그리고 **통짜 파일이
// 부분 diff 보다 훨씬 덜 깨진다** — diff 는 문맥이 한 줄만 어긋나도 적용에 실패한다.
// 통짜로 부족한 것이 확인되면 그때 루프를 짓는다.
//
// ── TDD 를 약속이 아니라 기계로 강제한다 ─────────────────────────────────
//
// 테스트 파일과 구현 파일을 한 번에 받되 **두 단계로 나눠 적용**한다:
//   1) 테스트만 쓰고 돌린다 → 반드시 실패해야 한다. 통과하면 그 테스트는 아무것도 잡지
//      못한다는 뜻이므로 배치를 거부한다.
//   2) 구현을 쓰고 다시 돌린다 → 반드시 통과해야 한다.
// 코더가 TDD 를 건너뛸 방법이 없다.
//
// ── 왜 워크트리인가 ─────────────────────────────────────────────────────
//
// `~/site` 의 작업트리는 **실서비스가 그대로 읽는다**(webapp/public/). 거기 쓰면 검증 전
// 코드가 라이브가 된다 — 실제로 겪었다. 그래서 별도 워크트리에서만 쓴다.
//
// 사용:
//   node coder.mjs --spec spec.md [--worktree <경로>] [--branch <이름>]
//   node coder.mjs --spec spec.md --from-json canned.json   # 모델 호출 없이 검증용
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const REPO = '/home/seungrye/site';
const API = 'https://openrouter.ai/api/v1/chat/completions';

// 429 는 실측 1/3 로 온다(무료 stealth 모델의 공용 풀). 재시도는 선택이 아니다.
const MAX_ATTEMPTS = 6;
const BACKOFF_MS = [2000, 5000, 10000, 20000, 30000];

function die(msg) {
  console.error(`[coder] ${msg}`);
  process.exit(1);
}
function log(msg) {
  console.log(`[coder] ${msg}`);
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

/** 테스트를 돌리고 {ok, output} 을 준다. 실패해도 던지지 않는다 — 실패가 정상인 단계가 있다. */
function runTests(worktree, paths) {
  try {
    const out = sh('pnpm', ['vitest', 'run', ...paths], {
      cwd: join(worktree, 'webapp'),
      stdio: 'pipe',
      maxBuffer: 32 * 1024 * 1024,
    });
    return { ok: true, output: out };
  } catch (e) {
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

/**
 * 쓸 수 있는 경로인가.
 *
 * 워크트리 밖으로 나가는 것, git 내부, 비밀 파일은 막는다. 코더는 스펙에 적힌 일만 하면
 * 되고, 그 밖을 건드릴 이유가 없다.
 */
function safePath(p) {
  if (typeof p !== 'string' || !p.trim()) return false;
  if (p.startsWith('/') || p.includes('..')) return false;
  if (p.startsWith('.git/') || p.includes('/.git/')) return false;
  if (/(^|\/)\.env/.test(p)) return false;
  return true;
}

function writeFiles(worktree, files) {
  for (const f of files) {
    const abs = join(worktree, f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.content, 'utf8');
    log(`  ${f.kind === 'test' ? '테스트' : '구현  '} ${f.path}`);
  }
}

const SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'code_change',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              kind: { type: 'string', enum: ['test', 'impl'] },
              content: { type: 'string' },
            },
            required: ['path', 'kind', 'content'],
            additionalProperties: false,
          },
        },
      },
      required: ['summary', 'files'],
      additionalProperties: false,
    },
  },
};

async function callModel({ key, model, prompt }) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 32000,
        messages: [{ role: 'user', content: prompt }],
        response_format: SCHEMA,
      }),
    });
    const body = await res.json();

    if (body.error) {
      const code = body.error.code;
      // 429 는 상위 제공자의 공용 풀 제한이다. 기다리면 대개 풀린다.
      if (code === 429 && attempt < MAX_ATTEMPTS) {
        const wait = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
        log(`429 — ${wait / 1000}초 뒤 재시도 (${attempt}/${MAX_ATTEMPTS})`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      die(`모델 오류 ${code}: ${String(body.error.message).slice(0, 200)}`);
    }

    const text = body.choices?.[0]?.message?.content;
    if (!text) die('모델이 빈 응답을 돌려줬습니다.');
    try {
      return JSON.parse(text);
    } catch {
      die(`모델 응답이 JSON 이 아닙니다: ${text.slice(0, 200)}`);
    }
  }
  die('재시도를 모두 소진했습니다.');
}

// ── 본문 ────────────────────────────────────────────────────────────────

const specPath = arg('spec') ?? die('--spec <파일> 이 필요합니다.');
const worktree = resolve(arg('worktree', '/home/seungrye/site-coder'));
const branch = arg('branch', `coder/${Date.now()}`);
const fromJson = arg('from-json');

if (resolve(worktree) === resolve(REPO)) {
  die('워크트리가 실서비스 작업트리와 같습니다. 다른 경로를 쓰세요.');
}

const spec = readFileSync(specPath, 'utf8');

// 1) 워크트리 준비 — 없으면 만든다.
if (!existsSync(worktree)) {
  log(`워크트리 생성: ${worktree} (${branch})`);
  sh('git', ['worktree', 'add', '-b', branch, worktree, 'main'], { cwd: REPO, stdio: 'pipe' });
} else {
  log(`워크트리 재사용: ${worktree}`);
}

// 갓 만든 워크트리에는 node_modules 가 없어 vitest 가 아예 못 돈다.
// 다시 설치하지 않고 본체 것을 가리킨다 — 같은 커밋의 같은 package.json 이라 내용이 같고,
// 설치는 수 분이 걸린다.
const wtModules = join(worktree, 'webapp/node_modules');
if (!existsSync(wtModules)) {
  log('node_modules 를 본체로 연결합니다');
  sh('ln', ['-s', join(REPO, 'webapp/node_modules'), wtModules], { stdio: 'pipe' });
}

// 2) 모델 호출 (또는 검증용 캔 응답)
let result;
if (fromJson) {
  log(`캔 응답 사용: ${fromJson} (모델 호출 없음)`);
  result = JSON.parse(readFileSync(fromJson, 'utf8'));
} else {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) die('OPENROUTER_API_KEY 가 환경에 없습니다.');
  const model = process.env.AI_CODER_MODEL?.trim() || 'stealth/ox-alpha';

  const rules = readFileSync(join(REPO, 'docs/development.md'), 'utf8');
  const prompt = [
    '당신은 이 저장소의 코더입니다. 아래 규칙과 스펙에 따라 코드를 작성하세요.',
    '',
    '## 저장소 작업 규칙',
    rules,
    '',
    '## 반드시 지킬 것',
    '- **테스트를 먼저** 쓰고, 그 테스트는 구현 없이 돌리면 **반드시 실패**해야 합니다.',
    '  (이 하네스가 테스트만 먼저 적용해 실패를 확인합니다. 통과해 버리면 거부됩니다.)',
    '- 각 파일의 kind 를 정확히 표시하세요: 테스트는 "test", 구현은 "impl".',
    '- 파일 내용은 **전체**를 주세요. diff 나 일부만 주면 안 됩니다.',
    '- 경로는 저장소 루트 기준 상대경로입니다.',
    '',
    '## 스펙',
    spec,
  ].join('\n');

  log(`모델 호출: ${model}`);
  result = await callModel({ key, model, prompt });
}

const files = Array.isArray(result.files) ? result.files : [];
const bad = files.filter((f) => !safePath(f.path));
if (bad.length) die(`쓸 수 없는 경로: ${bad.map((f) => f.path).join(', ')}`);

const tests = files.filter((f) => f.kind === 'test');
const impls = files.filter((f) => f.kind === 'impl');
if (!tests.length) die('테스트 파일이 없습니다. TDD 를 건너뛴 배치는 받지 않습니다.');
if (!impls.length) die('구현 파일이 없습니다.');

log(`요약: ${String(result.summary ?? '').slice(0, 200)}`);

// 3) 빨강 — 테스트만 적용하고 돌린다. 여기서 통과하면 그 테스트는 아무것도 잡지 못한다.
log('① 테스트만 적용하고 돌립니다 (실패해야 정상)');
writeFiles(worktree, tests);
const testPaths = tests.map((f) => f.path.replace(/^webapp\//, ''));
const red = runTests(worktree, testPaths);

if (red.ok) {
  console.error(red.output.slice(-2000));
  die('구현 없이도 테스트가 통과했습니다 — 아무것도 잡지 못하는 테스트입니다. 배치를 거부합니다.');
}
log('   빨강 확인 ✓');
const redOut = red.output;

// 4) 초록 — 구현을 적용하고 전체를 돌린다.
log('② 구현을 적용하고 전체 스위트를 돌립니다 (통과해야 정상)');
writeFiles(worktree, impls);
const green = runTests(worktree, []);

if (!green.ok) {
  console.error(green.output.slice(-3000));
  die('구현을 적용해도 테스트가 통과하지 않습니다. 워크트리를 남겨 두니 확인하세요.');
}
log('   초록 확인 ✓');

// 5) 커밋만 한다. 푸시·PR·머지는 사람 검수 뒤의 일이다.
sh('git', ['add', '-A'], { cwd: worktree, stdio: 'pipe' });
sh('git', ['commit', '-q', '-m', `coder: ${String(result.summary ?? '변경').slice(0, 72)}`], {
  cwd: worktree,
  stdio: 'pipe',
});
const sha = sh('git', ['rev-parse', '--short', 'HEAD'], { cwd: worktree }).trim();

const redPath = join(worktree, 'RED.txt');
writeFileSync(redPath, redOut, 'utf8');

log('');
log(`완료 — ${worktree} 의 ${branch} 에 ${sha} 커밋`);
log(`빨강 출력은 ${redPath} 에 남겼습니다 (PR 본문에 붙이세요).`);
log('푸시·PR 은 하지 않았습니다.');
