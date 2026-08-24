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
