// Notification read state (#247) - the pure part.
//
// Opening `/notifications` used to mark everything read (it pushed `notificationsSeenAt` to now). So the "unread"
// marking survived only **the first render** after a new comment arrived and vanished on a reload - however bold the
// marker was, there was nothing left to see by the time you looked.
//
// Read now means **"dealt with"**, not "seen": tapping an item and going to the comment marks only that one read.
//
// Two values decide it together.
//   the baseline `notificationsSeenAt` - anything older is read, unconditionally
//   the per-item `notificationsReadIds` - the ones newer than the baseline that were tapped
// The baseline is what lets [mark all read] clear everything at once and stops the existing 122 from coming back
// and pushing the badge to 99+.
import { describe, it, expect } from 'vitest';
import {
  isUnread,
  nextReadIds,
  READ_IDS_CAP,
  UNREAD_FIELD,
  notificationPipeline,
} from './notification-read';

const SEEN = new Date('2026-08-24T00:00:00Z');
const NEWER = new Date('2026-08-24T01:00:00Z');
const OLDER = new Date('2026-08-23T23:00:00Z');

describe('isUnread — 이 항목에 표식을 남길까', () => {
  it('기준선보다 새 것이고 누른 적 없으면 안 읽음', () => {
    expect(isUnread(NEWER, SEEN, new Set(), 'c1')).toBe(true);
  });

  it('눌러서 처리했으면 읽음 — 이게 이번 변경의 핵심이다', () => {
    expect(isUnread(NEWER, SEEN, new Set(['c1']), 'c1')).toBe(false);
  });

  it('다른 항목을 눌렀다고 이게 읽음이 되지는 않는다', () => {
    expect(isUnread(NEWER, SEEN, new Set(['c2']), 'c1')).toBe(true);
  });

  it('기준선보다 오래된 것은 안 눌렀어도 읽음 — [모두 읽음]이 이걸로 정리된다', () => {
    expect(isUnread(OLDER, SEEN, new Set(), 'c1')).toBe(false);
  });

  it('기준선과 같은 시각이면 읽음 (경계는 초과일 때만 새 것)', () => {
    expect(isUnread(SEEN, SEEN, new Set(), 'c1')).toBe(false);
  });

  it('시각이 없으면 표식을 남기지 않는다 — 모르면 조용한 쪽으로', () => {
    expect(isUnread(null, SEEN, new Set(), 'c1')).toBe(false);
  });

  it('문자열 시각도 받는다 (JSON 을 거쳐 온 값)', () => {
    expect(isUnread(NEWER.toISOString(), SEEN, new Set(), 'c1')).toBe(true);
  });
});

describe('nextReadIds — 읽음 목록에 하나 더하기', () => {
  it('없던 것을 뒤에 붙인다', () => {
    expect(nextReadIds(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('이미 있으면 그대로 둔다 — 같은 항목을 두 번 눌러도 늘지 않는다', () => {
    expect(nextReadIds(['a', 'b'], 'b')).toEqual(['a', 'b']);
  });

  it('빈 목록에서 시작할 수 있다', () => {
    expect(nextReadIds([], 'a')).toEqual(['a']);
  });

  // Never pressing [mark all read] would let it grow without bound, so there is a cap.
  // The oldest go first - once the baseline rises they count as read anyway.
  it('상한을 넘으면 오래된 것부터 버린다', () => {
    const full = Array.from({ length: READ_IDS_CAP }, (_, i) => `c${i}`);
    const next = nextReadIds(full, 'new');
    expect(next).toHaveLength(READ_IDS_CAP);
    expect(next.at(-1)).toBe('new');
    expect(next).not.toContain('c0');
  });

  it('상한 안에서는 아무것도 버리지 않는다', () => {
    const some = Array.from({ length: 10 }, (_, i) => `c${i}`);
    expect(nextReadIds(some, 'new')).toHaveLength(11);
  });
});

// Unread first (#249).
//
// Sorting in code only shuffles **within the 20 already fetched** - an unread notification at position 21 stays
// invisible while the bell badge counts it, so the number and the list disagree.
// So the sort key goes down to the DB and lifts it **before** the slice.
describe('notificationPipeline — 안읽음 먼저, 그 다음 시간순', () => {
  const SEEN_AT = new Date('2026-08-24T00:00:00Z');
  const FILTER = { isDeleted: { $ne: true } };
  const stage = (p: Record<string, unknown>[], key: string) =>
    p.find((s) => key in s) as Record<string, unknown> | undefined;

  it('주어진 조건으로 먼저 거른다 — 남의 알림이 파이프라인에 들어오면 안 된다', () => {
    const p = notificationPipeline(FILTER, SEEN_AT, [], 20);
    expect(p[0]).toEqual({ $match: FILTER });
  });

  it('안읽음을 먼저, 같은 그룹 안에서는 최신순', () => {
    const sort = stage(notificationPipeline(FILTER, SEEN_AT, [], 20), '$sort');
    expect(sort?.$sort).toEqual({ [UNREAD_FIELD]: -1, createdAt: -1 });
  });

  // Sorting after the slice leaves an unread notification at position 21 invisible forever.
  it('정렬한 다음에 자른다 — 순서가 뒤바뀌면 안 된다', () => {
    const p = notificationPipeline(FILTER, SEEN_AT, [], 20);
    const sortAt = p.findIndex((s) => '$sort' in s);
    const limitAt = p.findIndex((s) => '$limit' in s);
    expect(sortAt).toBeGreaterThan(-1);
    expect(limitAt).toBeGreaterThan(sortAt);
    expect(p[limitAt]).toEqual({ $limit: 20 });
  });

  it('안읽음 판정은 화면과 같은 규칙 — 기준선보다 새롭고 누르지 않은 것', () => {
    const add = stage(notificationPipeline(FILTER, SEEN_AT, [], 20), '$addFields');
    const expr = (add?.$addFields as Record<string, unknown>)[UNREAD_FIELD];
    expect(JSON.stringify(expr)).toContain('$gt');
    expect(JSON.stringify(expr)).toContain(SEEN_AT.toISOString());
  });

  // readIds are strings and _id is an ObjectId, so a plain comparison never matches.
  // A tapped notification would then stay unread and stick to the top.
  it('누른 id 는 문자열로 바꿔 비교한다', () => {
    const add = stage(notificationPipeline(FILTER, SEEN_AT, ['c1'], 20), '$addFields');
    const expr = JSON.stringify((add?.$addFields as Record<string, unknown>)[UNREAD_FIELD]);
    expect(expr).toContain('$toString');
    expect(expr).toContain('c1');
  });

  it('누른 것이 없으면 id 비교를 아예 넣지 않는다', () => {
    const add = stage(notificationPipeline(FILTER, SEEN_AT, [], 20), '$addFields');
    const expr = JSON.stringify((add?.$addFields as Record<string, unknown>)[UNREAD_FIELD]);
    expect(expr).not.toContain('$toString');
  });

  it('계산에 쓴 필드는 결과에서 지운다 — 응답에 새어 나갈 이유가 없다', () => {
    const p = notificationPipeline(FILTER, SEEN_AT, [], 20);
    expect(stage(p, '$unset')?.$unset).toBe(UNREAD_FIELD);
  });
});
