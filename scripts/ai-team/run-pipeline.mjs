#!/usr/bin/env node
// 클로드가 남긴 요청을 읽어 파이프라인을 **전경으로** 돌린다 (#292).
//
// `run.sh` 가 `claude -p` 가 끝난 **뒤에** 부른다. 그러면 파이프라인이 `ExecStart` 안에서
// 도니 `Type=oneshot` cgroup 정리에 안 걸리고 `TimeoutStartSec` 3시간이 실제로 적용된다.
//
// 예전엔 클로드가 직접 띄웠는데, 20분~3시간짜리라 `Bash` 도구 타임아웃을 넘겨 백그라운드로
// 돌리고 먼저 턴을 끝냈다 → SIGKILL. 매일 밤 그랬다(#292 본문 참고).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRequest, REQUEST_PATH } from './request.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(`\x1b[1;36m[pipeline-run]\x1b[0m ${m}`);
const warn = (m) => console.error(`\x1b[1;33m[pipeline-run]\x1b[0m ${m}`);

const path = process.argv[2] || REQUEST_PATH;
if (!existsSync(path)) {
  log('파이프라인 요청 없음 — 넘어갑니다');
  process.exit(0);
}

let text = '';
try {
  text = readFileSync(path, 'utf8');
} catch (e) {
  warn(`요청 파일을 읽지 못했습니다: ${e?.message ?? e}`);
  process.exit(1);
}

// **읽자마자 지운다.** 파이프라인이 죽더라도 다음 밤에 같은 요청이 다시 돌면 안 된다 —
// 스펙은 그날의 판단이고, 이미 브랜치가 올라갔을 수도 있다.
rmSync(path, { force: true });

const req = parseRequest(text);
if (!req) {
  warn(`요청 형식이 아닙니다 — 돌리지 않습니다.\n${text.slice(0, 300)}`);
  process.exit(1);
}
if (!existsSync(req.spec)) {
  warn(`스펙 파일이 없습니다: ${req.spec}`);
  process.exit(1);
}

log(`전경 실행: ${req.spec}${req.post ? ` (스레드 ${req.post})` : ''}`);
try {
  execFileSync(join(HERE, 'pipeline.mjs'),
    ['--spec', req.spec, ...(req.post ? ['--post', req.post] : [])],
    { stdio: 'inherit' });
  log('파이프라인 완료');
} catch (e) {
  // 2 = 막혀서 salvage 로 끝난 것. 브랜치·이슈·덧글이 남았으므로 **처리된 실패**다.
  // 유닛까지 failed 로 만들면 아침에 진짜 고장과 구분이 안 된다.
  if (e?.status === 2) {
    log('파이프라인이 막혔습니다 — 브랜치·이슈·덧글로 넘겼습니다');
    process.exit(0);
  }
  warn(`파이프라인이 실패했습니다 (exit ${e?.status ?? '?'})`);
  process.exit(1);
}
