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

export interface AiTeamPostFields {
  userEmail?: string;
  isPrivate?: boolean;
  isDeleted?: boolean;
  tags?: string[];
}

/** `^ai-req$` — `ai-req-2` 같은 이웃 태그에 걸리지 않게 양 끝을 묶는다. */
function tagPattern(): RegExp {
  return new RegExp(`^${AI_TEAM_TAG}$`, 'iu');
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
    tags: tagPattern(),
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

  const tags = Array.isArray(post.tags) ? post.tags : [];
  return tags.some((t) => typeof t === 'string' && t.trim().toLowerCase() === AI_TEAM_TAG);
}
