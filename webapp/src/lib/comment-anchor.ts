// 알림에서 덧글로 이동 (#241, #243) — 순수 부분.
//
// 처음엔 `#comment-<id>` 로 개별 덧글을 직접 노렸다. 그런데 비공개 글은 PrivatePostGate 가
// 클라이언트에서 나중에 그려서, 브라우저가 해시로 점프하려는 순간 대상이 DOM 에 없었다.
// 나중에 생겨도 브라우저는 다시 점프하지 않는다.
//
// 메인 화면의 말풍선(`post-item.tsx`)은 `#comments-section` 으로 간다 — **섹션 앵커**라
// 렌더 타이밍을 타지 않고 잘 동작한다. 알림도 그 방식을 따른다. 덧글 id 는 쿼리로 실어
// 보내고, 도착한 뒤 그 덧글이 그려지면 거기까지 한 번 더 스크롤한다.
// **못 찾아도 섹션에는 이미 도착해 있다** — 아무 데도 못 가는 일이 없다.

/** 덧글 섹션 앵커. 메인 말풍선이 쓰는 것과 같은 값이다. */
export const COMMENTS_SECTION = 'comments-section';

/** 대상 덧글을 실어 나르는 쿼리 이름. */
const COMMENT_PARAM = 'c';

/**
 * 알림 항목이 가리킬 주소.
 *
 * 쿼리를 먼저, 해시를 뒤에 둔다 — 해시 뒤의 쿼리는 해시의 일부로 취급돼 파싱되지 않는다.
 */
export function notificationHref(postId: string, commentId: string): string {
  const base = `/post/view/${encodeURIComponent(postId)}`;
  const query = commentId ? `?${COMMENT_PARAM}=${encodeURIComponent(commentId)}` : '';
  return `${base}${query}#${COMMENTS_SECTION}`;
}

/**
 * 쿼리에서 스크롤할 덧글의 요소 id 를 뽑는다.
 *
 * @returns `comment-<덧글id>`, 또는 관여하지 않을 때 null.
 */
export function targetCommentId(search: string): string | null {
  const id = new URLSearchParams(search).get(COMMENT_PARAM);
  if (!id) return null;
  return `comment-${id}`;
}

/**
 * 덧글 섹션이 **맨 위로** 스크롤해도 되는지 (#247).
 *
 * 섹션은 본문 렌더가 끝나면(`richContentRendered`) 해시를 보고 자기 맨 위로 스크롤한다.
 * 그게 CommentAnchor 의 "그 덧글 가운데로" 보다 **나중에** 실행돼 덮어썼다 — 알림을 눌러도
 * 늘 덧글 목록 처음으로 갔던 이유다. 갈 곳이 정해져 있으면 비켜 준다.
 */
export function shouldScrollToSection(hash: string, search: string): boolean {
  if (hash !== `#${COMMENTS_SECTION}`) return false;
  return targetCommentId(search) === null;
}

/**
 * 덧글 상단을 화면 어디에 놓을지 (#255).
 *
 * 2/5 지점. 위쪽 40% 로 앞 맥락(무엇에 달린 답글인지)이 보이고, 덧글은 첫 줄부터 읽힌다.
 */
export const ANCHOR_VIEWPORT_RATIO = 0.4;

/**
 * 그 덧글로 갈 때 멈출 스크롤 위치 (#255).
 *
 * 예전엔 `scrollIntoView({ block: 'center' })` 로 **덧글의 가운데**를 화면 중앙에 맞췄다.
 * 덧글이 화면보다 길면 상단이 화면 밖으로 밀린다 — 실측(1680×1000)에서 덧글 높이 1154,
 * 덧글 top −77 이었다. 가운데는 정확히 맞았는데 정작 첫 줄이 화면 위에 있었다.
 *
 * **요소 높이를 아예 보지 않는다** — 상단만 기준이라 아무리 긴 덧글이어도 첫 줄이 밀리지 않는다.
 *
 * @param rectTop  화면 기준 요소 상단 (`getBoundingClientRect().top`)
 * @param scrollY  현재 스크롤 위치
 * @param viewportHeight 화면 높이
 */
export function scrollTopFor(
  rectTop: number,
  scrollY: number,
  viewportHeight: number,
  ratio: number = ANCHOR_VIEWPORT_RATIO,
): number {
  const documentTop = rectTop + scrollY;
  // 문서 맨 위 근처면 더 올라갈 곳이 없다 — 음수로 요청하면 브라우저가 0 으로 처리하지만
  // 계산 결과 자체를 0 으로 맞춰 둬야 테스트로 의도를 고정할 수 있다.
  return Math.max(0, documentTop - viewportHeight * ratio);
}
