// 스크린샷 통로의 순수 규칙 (#317).
//
// 러너가 "저도 파이프라인도 화면을 못 찍는다" 며 사람에게 되묻고 있었다. 사람이 요청한
// 것은 "수정 결과를 데스크톱·모바일 크기로 캡처해 보여 달라" 였다.
//
// `api.sh`·`db.mjs` 와 같은 방식으로 좁은 래퍼를 둔다. 다만 여기서는 **경로를 그대로
// 믿으면 안 된다** — 외부 URL 을 주면 주인 세션 쿠키를 엉뚱한 곳에 붙여 보낼 수 있다.
// 그래서 로컬 경로만 받고, 주소는 이쪽에서 조립한다.
//
// 판정만 여기 둔다 — 브라우저와 업로드는 shot.mjs 가 한다.

/** 요청받은 두 크기. 데스크톱과 모바일. */
export const SIZES = Object.freeze([
  Object.freeze({ name: 'desktop', width: 1280, height: 900 }),
  Object.freeze({ name: 'mobile', width: 390, height: 844 }),
]);

/** `--port` 를 안 주면 사이트 공개 주소를 쓴다(주인 세션이 되는 유일한 길). */
const DEFAULT_PORT = 0;

/**
 * 논리 메뉴 이름 → 뷰포트별로 눌러야 할 aria-label 순서 (#321).
 *
 * 네비바 드롭다운은 hover 가 아니라 클릭으로 열린다. 누를 것이 뷰포트마다 달라서
 * (데스크톱은 버튼 하나, 모바일은 햄버거 → 섹션 토글) 논리 이름으로 받아 여기서 번역한다.
 *
 * @type {Readonly<Record<string, { desktop: string[], mobile: string[] }>>}
 */
export const MENUS = Object.freeze({});

/**
 * 그 뷰포트에서 메뉴를 펼치려면 무엇을 어떤 순서로 누르는지.
 *
 * 모르는 이름이거나 메뉴를 안 줬으면 빈 목록 — 던지지 않는다. 부르는 쪽이 고쳐 쓸 수
 * 있게 **매번 새 배열**을 낸다.
 *
 * @param {string|undefined} menu 논리 메뉴 이름
 * @param {string} sizeName `SIZES` 의 뷰포트 이름
 * @returns {string[]}
 */
export function clickPlan(menu, sizeName) {}

/**
 * 인자 → `{path, owner, port}`. 받아들일 수 없으면 `null`.
 *
 * **경로만 받는다.** 스킴이나 `//` 로 시작하면 밖을 겨누는 것이라 거절한다.
 */
export function parseShotArgs(argv) {
  if (!Array.isArray(argv) || !argv.length) return null;

  let path = '';
  let owner = false;
  let port = DEFAULT_PORT;

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--owner') { owner = true; continue; }
    if (a === '--port') {
      const n = Number(argv[i + 1]);
      if (!Number.isInteger(n) || n < 1 || n > 65535) return null;
      port = n; i += 1; continue;
    }
    if (a.startsWith('--')) return null;
    if (path) return null;
    path = a;
  }

  if (!path) return null;
  // 스킴·프로토콜 상대주소는 밖을 겨눈다.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return null;
  if (path.includes('..')) return null;
  if (!path.startsWith('/')) path = `/${path}`;

  // 주인 세션은 공개 주소로만 붙는다 — 로컬 http 로는 Secure 쿠키가 안 간다.
  if (owner && port) return null;
  return { path, owner, port };
}

/**
 * 주소는 여기서 조립한다 — **호스트를 인자로 받지 않는 것이 요점이다.**
 *
 * `--port` 를 주면 그 로컬 인스턴스를, 안 주면 사이트 공개 주소를 겨눈다.
 *
 * 주인 세션은 공개 주소로만 된다. 서버가 `__Secure-` 접두사 쿠키를 쓰는데(실측:
 * `/api/auth/csrf` 응답이 `__Host-authjs.csrf-token` 을 준다) 그런 쿠키는 **http 로는
 * 브라우저가 보내지 않는다.** `NEXTAUTH_URL` 이 https 라 그렇게 동작한다.
 */
export function targetUrl({ path, port }, origin) {
  if (port) return `http://127.0.0.1:${port}${path}`;
  return `${String(origin || '').replace(/\/$/, '')}${path}`;
}
