// AI 팀 요청 스레드 판정 (#207).
//
// AI 둘(Claude·MiniMax)은 브라우저 세션이 없다. 키 하나로 들어오므로, **키가 새면 무엇까지
// 열리는가**가 이 파일에 달려 있다. 그래서 열어 주는 범위를 세 조건의 교집합으로 좁힌다:
//
//   ① 주인(OWNER_EMAIL)의 글이고  ② 비공개이고  ③ `ai-req` 태그가 달렸다
//
// 셋 다 맞아야 한다. 주인의 다른 비공개 글(일기·메모)은 태그가 없어 걸리지 않고, 남이 자기
// 글에 `ai-req` 를 달아도 주인 것이 아니라 걸리지 않는다.
//
// 판정을 **필터와 함수 두 벌**로 둔 것은 일부러다. 조회는 필터로 하고, 조회해 온 문서를
// 쓰기 직전에 함수로 한 번 더 본다 — 필터를 빠뜨린 질의가 하나라도 생기면 그게 곧 구멍이라,
// 쓰기 경로에서는 문서 자체를 다시 확인한다.

/** 요청 글임을 나타내는 태그. 제목 키워드보다 낫다 — 이미 인덱스가 있고 오타 위험이 적다. */
export const AI_TEAM_TAG = 'ai-req';

/**
 * 끝난 요청 표시 (#213).
 *
 * 완료 개념이 없던 동안, 한 번 `ai-req` 를 단 글은 **영원히** 목록에 나왔다. 주인이
 * "고마워" 한 마디만 달아도 마지막 덧글이 사람 것이 되어 다음 밤에 또 응답했다.
 *
 * **요청 태그를 떼는 게 아니라 이걸 더한다.** 떼면 그 글이 요청이었다는 흔적이 사라지고,
 * 다시 열려면 뭘 붙여야 했는지 기억해야 한다. 더하는 방식이면 되돌리기는 이것만 빼면 된다.
 *
 * 닫는 주체는 **사람**이다. AI 가 스스로 닫으면 성급하게 닫을 위험이 있고, 자율성 (A) 상
 * AI 는 덧글만 단다 — 대신 "닫으시려면 이 태그를 붙여주세요" 라고 안내한다.
 */
export const AI_DONE_TAG = 'ai-done';

export interface AiTeamPostFields {
  userEmail?: string;
  isPrivate?: boolean;
  isDeleted?: boolean;
  tags?: string[];
}

/** `^<태그>$` — `ai-req-2` 같은 이웃 태그에 걸리지 않게 양 끝을 묶는다. */
function tagPattern(tag: string): RegExp {
  return new RegExp(`^${tag}$`, 'iu');
}

/** 문서가 이 태그를 달고 있나 — 대소문자·앞뒤 공백 무시. */
function hasTag(post: AiTeamPostFields, tag: string): boolean {
  const tags = Array.isArray(post.tags) ? post.tags : [];
  return tags.some((t) => typeof t === 'string' && t.trim().toLowerCase() === tag);
}

/**
 * 요청 글 조회용 mongo 필터.
 *
 * @throws 주인 이메일이 비었을 때. OWNER_EMAIL 미설정 배포에서 `{userEmail: ''}` 로 조회되면
 *   userEmail 이 빈 문서와 맞아떨어져 문이 열린다. 조용히 빈 결과를 주는 대신 터뜨린다.
 */
export function aiTeamPostFilter(ownerEmail: string): Record<string, unknown> {
  if (!ownerEmail) {
    throw new Error('aiTeamPostFilter: 주인 이메일(OWNER_EMAIL)이 비어 있습니다.');
  }
  return {
    userEmail: ownerEmail,
    isPrivate: true,
    isDeleted: { $ne: true },
    // 한 키(`tags`)에 조건이 둘이라 `$and` 로 묶는다.
    // 배열 필드에 `$not` + 정규식이면 "**어느 원소도** 맞지 않는 문서"가 걸린다.
    // 이건 틀리면 조용히 전부 반환하거나 전부 막으므로 실제 mongo 로 확인했다(#213).
    $and: [
      { tags: tagPattern(AI_TEAM_TAG) },
      { tags: { $not: tagPattern(AI_DONE_TAG) } },
    ],
  };
}

/**
 * 이 글이 AI 팀 요청 스레드인가 — 조회해 온 문서로 다시 확인한다.
 *
 * @param post 글의 판정 필드. 없으면 거부한다.
 * @param ownerEmail 주인 이메일. 비어 있으면 무조건 거부.
 */
export function isAiTeamPost(
  post: AiTeamPostFields | null | undefined,
  ownerEmail: string | null | undefined,
): boolean {
  if (!post || !ownerEmail) return false;
  if (post.isPrivate !== true) return false;
  if (post.isDeleted === true) return false;
  // 빈 문자열끼리 맞아떨어져 주인으로 오인되지 않게 값이 있는지부터 본다.
  if (!post.userEmail || post.userEmail !== ownerEmail) return false;

  if (!hasTag(post, AI_TEAM_TAG)) return false;
  // 끝난 요청은 다시 열지 않는다 (#213).
  return !hasTag(post, AI_DONE_TAG);
}
