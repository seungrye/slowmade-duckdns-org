// 리비전 열람 권한 (#168).
//
// 침투 테스트에서 비로그인으로 비공개 글의 **제목과 본문 전문**이 새는 것을 확인했다.
// `/api/post/revisions` 와 `/api/post/revision` 두 라우트에 인가 검사가 아예 없었다.
//
// 판정을 한 곳에 모아 둔다 — 두 라우트가 서로 다른 규칙을 쓰면 또 한쪽이 뚫린다.
// 규칙은 첨부(`api/attachment/*`)와 같다: 비공개·삭제된 글은 **작성자 본인만**.

export interface PostAccessFields {
  isPrivate?: boolean;
  isDeleted?: boolean;
  userEmail?: string;
}

/**
 * 이 글의 리비전 이력을 볼 수 있는가.
 *
 * @param post 글의 권한 필드. 없으면(못 찾음) 거부한다 — 존재 여부도 알려 주지 않는다.
 * @param viewerEmail 로그인 사용자 이메일. 비로그인이면 null.
 */
export function canReadPostHistory(
  post: PostAccessFields | null | undefined,
  viewerEmail: string | null | undefined,
): boolean {
  if (!post) return false;
  const restricted = post.isPrivate === true || post.isDeleted === true;
  if (!restricted) return true;
  // 빈 문자열끼리 맞아떨어져 소유자로 오인되지 않게 값이 있는지부터 본다.
  return !!viewerEmail && !!post.userEmail && viewerEmail === post.userEmail;
}
