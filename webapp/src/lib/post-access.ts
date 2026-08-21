// 봇 덧글 권한 (#205).
//
// `api/enji` 와 `api/painter` 가 글을 **존재만** 확인하고 통과시켰다. 로그인만 했으면 남의
// 비공개 글 id 로 덧글을 넣을 수 있었고, enji 는 그 본문 3000자를 남의 명령으로 Gemini 에
// 보냈다. 읽기 유출은 아니었다(덧글 GET 이 이미 비공개를 막는다) — 문제는 **쓰기 인가**다.
//
// 규칙은 리비전 열람(#168)과 **같다**: 비공개·삭제된 글은 작성자 본인만.
// 그래서 규칙을 다시 쓰지 않고 `canReadPostHistory` 에 위임한다 — 같은 규칙을 두 벌 두면
// 언젠가 갈라지고, 갈라진 쪽이 뚫린다. #168 이 정확히 그렇게 났다.
// 이름을 따로 두는 것은 호출부가 "덧글을 달 수 있나"를 묻고 있기 때문이고, 나중에 규칙이
// 진짜로 갈라져야 할 때 갈라질 자리를 남겨 두기 위해서다.
import { canReadPostHistory, type PostAccessFields } from './revisions-access';

/**
 * 이 글에 덧글을 달 수 있는가.
 *
 * @param post 글의 권한 필드. 없으면(못 찾음) 거부한다 — 존재 여부도 알려 주지 않는다.
 * @param viewerEmail 로그인 사용자 이메일. 비로그인이면 null(공개 글에는 익명 덧글이 허용된다).
 */
export function canCommentOn(
  post: PostAccessFields | null | undefined,
  viewerEmail: string | null | undefined,
): boolean {
  return canReadPostHistory(post, viewerEmail);
}
