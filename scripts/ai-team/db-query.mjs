// 씬 조회 통로의 순수 규칙 (#310).
//
// ── 왜 래퍼인가 ────────────────────────────────────────────────────────
//
// 클로드가 "공중도시 붕괴에 해당하는 씬이 뭐냐" 를 **DB 를 못 읽어 사람에게 되묻고**
// 있었다. 스스로 찾을 수 있어야 하는 정보다.
//
// 그렇다고 원시 접속을 줄 수는 없다. 이 DB 는 **인증이 없고**(127.0.0.1:27017) 같은
// 곳에 posts·users·comments 가 함께 있다 — 통째로 열면 다른 사용자의 비공개 글과 계정
// 정보까지 노출된다.
//
// 그래서 `api.sh` 와 같은 방식을 쓴다. 그 주석의 논리 그대로다 — "할 수 있는 일을 못박아
// 두면 러너가 잘못 판단해도 그 밖으로는 못 나간다." 여기서는 셋뿐이고 전부 읽기다.
//
// 판정과 문구만 여기 둔다. 접속은 db.mjs 가 한다 — 그래야 DB 없이 시험할 수 있다.

/** 씬 하나를 보여줄 때의 본문 상한. 135건짜리 세계라 한 씬도 길 수 있다. */
export const MAX_BODY_CHARS = 4000;
/** 검색 결과에 실을 씬 수. 넘으면 수만 알린다. */
const MAX_HITS = 20;

/** 할 수 있는 일 — 이 셋뿐이고 전부 읽기다. */
const COMMANDS = { scenes: false, scene: true, search: true };

/**
 * 인자 → `{cmd, arg}`. **못박은 셋 밖이면 `null`.**
 *
 * `search` 는 낱말이 여럿 와도 한 문구로 잇는다 — 셸에서 따옴표를 빼먹기 쉽다.
 *
 * @param {string[]} argv 셸에서 넘어온 인자
 * @returns {{cmd:string, arg:string}|null}
 */
export function parseCommand(argv) {
  if (!Array.isArray(argv) || !argv.length) return null;
  const [cmd, ...rest] = argv;
  if (!Object.hasOwn(COMMANDS, cmd)) return null;
  const arg = rest.join(' ').trim();
  if (COMMANDS[cmd] && !arg) return null;
  return { cmd, arg };
}

/**
 * 검색어를 정규식 문자로 만든다.
 *
 * 이스케이프를 빼먹으면 `(a+)+$` 같은 것이 정규식으로 해석돼 터지거나 전부를 훑는다.
 */
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const 줄들 = (body) => (Array.isArray(body) ? body : typeof body === 'string' ? [body] : []);

/** 목록 — **본문은 안 싣는다.** 135건을 통째로 뱉으면 못 읽는다. */
export function formatScenes(docs) {
  const list = Array.isArray(docs) ? docs : [];
  if (!list.length) return '씬이 없습니다.';
  return [`씬 ${list.length}건`, '', ...list.map((d) => `- ${d?.id ?? '?'}  ${d?.title ?? ''}`)].join('\n');
}

/** 씬 하나 — 본문까지. 길면 자른다. */
export function formatScene(doc) {
  if (!doc) return '그런 씬이 없습니다.';
  const body = 줄들(doc.body).join('\n');
  const 잘림 = body.length > MAX_BODY_CHARS;
  return [
    `# ${doc.title ?? ''}  (${doc.id ?? '?'})`, '',
    잘림 ? `${body.slice(0, MAX_BODY_CHARS)}\n\n…(${body.length - MAX_BODY_CHARS}자 더 있음)` : body,
  ].join('\n');
}

/** 검색 — **걸린 줄만** 보여준다. 어디에 걸렸는지가 답이다. */
export function formatSearch(docs, term) {
  const list = Array.isArray(docs) ? docs : [];
  if (!list.length) return `"${term}" 이 든 씬이 없습니다.`;
  const 보일것 = list.slice(0, MAX_HITS);
  const 판 = new RegExp(escapeRegex(term), 'i');
  const 조각 = 보일것.map((d) => {
    const hits = 줄들(d?.body).filter((l) => 판.test(l)).slice(0, 3);
    const 제목걸림 = 판.test(String(d?.title ?? ''));
    return [
      `- ${d?.id ?? '?'}  ${d?.title ?? ''}${제목걸림 ? '  ← 제목' : ''}`,
      ...hits.map((l) => `    ${l.length > 200 ? `${l.slice(0, 200)}…` : l}`),
    ].join('\n');
  });
  const 남은 = list.length - 보일것.length;
  return [`"${term}" — ${list.length}건`, '', ...조각, ...(남은 > 0 ? ['', `…외 ${남은}건`] : [])].join('\n');
}
