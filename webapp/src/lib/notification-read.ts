// 알림 읽음 상태 (#247) — 순수 부분.
//
// 예전엔 `/notifications` 를 여는 것만으로 전부 읽음이 됐다(`notificationsSeenAt` 을 now 로
// 밀었다). 그래서 "안 읽음" 표시는 새 덧글이 온 뒤 **첫 렌더 한 번**만 살아있고 새로고침하면
// 사라졌다 — 표식을 진하게 해 봐야 정작 볼 때는 볼 것이 없었다.
//
// 이제 읽음은 "봤다"가 아니라 **"처리했다"** 다. 항목을 눌러 그 덧글로 갔을 때 그것만 읽음.
//
// ── 두 값이 함께 판정한다 ────────────────────────────────────────────
//
//   기준선 `notificationsSeenAt`  이보다 오래된 것은 무조건 읽음
//   개별   `notificationsReadIds` 기준선보다 새 것 중 눌러서 처리한 것
//
// 기준선을 없애고 개별 목록만 쓰면 기존 122건이 전부 안 읽음으로 되살아나 뱃지가 99+ 로
// 돌아간다. [모두 읽음] 은 기준선을 now 로 올리고 개별 목록을 비우는 것 하나로 끝난다.

/**
 * 읽음 id 목록의 상한.
 *
 * [모두 읽음] 을 한 번도 안 누르면 누른 만큼 계속 쌓이므로 상한을 둔다. 넘치면 오래된
 * 것부터 버려도 안전하다 — 기준선이 올라가면 어차피 읽음으로 판정된다.
 */
export const READ_IDS_CAP = 200;

/**
 * 이 항목에 "안 읽음" 표식을 남길지.
 *
 * @param createdAt 덧글이 달린 시각. 없으면 판단하지 않는다(조용한 쪽).
 * @param seenAt    기준선. 이보다 오래된 것은 읽음.
 * @param readIds   눌러서 처리한 덧글 id 들.
 * @param id        이 덧글 id.
 */
export function isUnread(
  createdAt: Date | string | null | undefined,
  seenAt: Date,
  readIds: Set<string>,
  id: string,
): boolean {
  if (!createdAt) return false;
  if (new Date(createdAt) <= seenAt) return false;
  return !readIds.has(id);
}

/** 읽음 목록에 하나 더한 결과. 중복은 늘리지 않고, 상한을 넘으면 오래된 것부터 버린다. */
export function nextReadIds(current: string[], id: string, cap: number = READ_IDS_CAP): string[] {
  if (current.includes(id)) return current;
  return [...current, id].slice(-cap);
}

/** 정렬에만 쓰는 계산 필드 이름. 결과에서는 지운다. */
export const UNREAD_FIELD = '_unread';

/**
 * 알림 목록 파이프라인 — **안 읽은 것 먼저, 그 다음 최신순** (#249).
 *
 * 정렬을 DB 에서 하는 이유: 목록은 최근 `limit` 건만 가져온다. **가져온 뒤** 코드에서
 * 정렬하면 이미 잘린 그 안에서만 섞이므로, 시간순으로 `limit` 밖에 있는 안 읽은 알림은
 * 애초에 딸려오지 않아 위로 올라올 기회조차 없다 — 벨 배지는 그걸 세는데 목록엔 없게 된다.
 * (seenAt 이후 25건인데 최신 20건을 하나씩 눌러 읽으면 남은 5건이 딱 그 상태가 된다.)
 * 그래서 **자르기 전에** 정렬한다.
 *
 * 안읽음 판정은 `isUnread` 와 같은 규칙이다 — 기준선보다 새롭고, 누르지 않은 것.
 */
export function notificationPipeline(
  filter: Record<string, unknown>,
  seenAt: Date,
  readIds: string[],
  limit: number,
): Record<string, unknown>[] {
  const isNew = { $gt: ['$createdAt', seenAt] };
  // readIds 는 문자열, _id 는 ObjectId 라 그대로 비교하면 절대 안 맞는다 — 그러면 누른
  // 알림이 계속 안읽음으로 남아 맨 위에 붙어 있게 된다.
  const notClicked =
    readIds.length > 0 ? { $not: { $in: [{ $toString: '$_id' }, readIds] } } : true;

  return [
    { $match: filter },
    { $addFields: { [UNREAD_FIELD]: { $and: [isNew, notClicked] } } },
    { $sort: { [UNREAD_FIELD]: -1, createdAt: -1 } },
    { $limit: limit },
    { $unset: UNREAD_FIELD },
  ];
}
