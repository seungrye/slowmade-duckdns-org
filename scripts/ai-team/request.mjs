// 파이프라인 요청 파일 (#292).
//
// ── 왜 요청 파일인가 ────────────────────────────────────────────────────
//
// 예전엔 클로드가 `pipeline.mjs` 를 직접 띄웠다(`run.sh` 허용 목록의 `Bash($PIPELINE *)`).
// 그런데 파이프라인은 20분~3시간짜리다. `Bash` 도구 타임아웃을 넘기니 클로드가 백그라운드로
// 돌리고 "완료 알림을 기다리겠습니다" 하고 턴을 끝냈다. 그 순간
//
//   claude -p 종료 → ExecStart 반환 → Type=oneshot cgroup 정리 → **SIGKILL**
//
// 매일 밤 그렇게 죽었다. SIGKILL 이라 `salvage()` 도 안 돌아 브랜치도 이슈도 덧글도
// 안 남았다. 8/28 실행은 빨강 게이트까지 통과하고 코더가 구현 중이었는데 통째로 사라졌다.
//
// 그래서 클로드는 **요청만** 남기고 러너가 `claude -p` 뒤에 전경으로 돌린다.
//
// ── 왜 /tmp/spec- 인가 ─────────────────────────────────────────────────
//
// 클로드 허용 목록에 `Bash(cat > /tmp/spec-*)` 가 이미 있다. 요청 파일도 그 접두사를 쓰면
// **권한이 새로 늘지 않는다.** 다른 경로를 쓰면 이 변경이 권한을 넓히는 셈이 된다.
//
// 파싱만 여기 둔다 — 파일을 읽지 않아야 파일 없이 시험할 수 있다.

/** 클로드가 남기는 요청 파일. `run.sh` 와 `run-pipeline.mjs` 가 같은 값을 본다. */
export const REQUEST_PATH = '/tmp/spec-pipeline-request';

/** 스펙은 이 아래만 받는다. 클로드가 쓰는 값이라 경로를 그대로 믿지 않는다. */
const SPEC_PREFIX = '/tmp/spec-';

/** MongoDB ObjectId — 24자리 16진수. */
const POST_ID = /^[0-9a-f]{24}$/;

/**
 * 요청 문자열 → `{ spec, post }`. 요청으로 볼 수 없으면 `null`.
 *
 * **모르면 안 돌린다.** 3시간을 쓰는 일이라, 애매한 요청을 관대하게 받아들이는 것보다
 * 거절하고 아침에 사람이 보게 하는 편이 싸다.
 *
 * `post` 가 있는데 모양이 틀리면 **요청째로 거절한다** — 엉뚱한 스레드에 덧글을 남기느니
 * 안 도는 게 낫다.
 *
 * @param {string} text 요청 파일 내용
 * @returns {{spec: string, post: string|null}|null}
 */
export function parseRequest(text) {
  if (typeof text !== 'string') return null;

  const fields = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    // 첫 `=` 로만 가른다 — 값에 `=` 가 들어 있어도 살아남아야 한다.
    fields.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }

  const spec = fields.get('spec') ?? '';
  if (!spec.startsWith(SPEC_PREFIX)) return null;
  // `/tmp/spec-../../etc/passwd` 는 접두사만 보면 통과한다.
  if (spec.includes('..')) return null;

  const post = fields.get('post') ?? '';
  if (!post) return { spec, post: null };
  if (!POST_ID.test(post)) return null;
  return { spec, post };
}
