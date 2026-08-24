// 알림 읽음 상태 (#247) — 순수 부분.
//
// 예전엔 `/notifications` 를 여는 것만으로 전부 읽음이 됐다(`notificationsSeenAt` 을 now 로
// 밀어 버렸다). 그래서 "안 읽음" 표시는 새 덧글이 온 뒤 **첫 렌더 한 번**만 살아있고
// 새로고침하면 사라졌다 — 표식을 아무리 진하게 해도 정작 볼 때는 볼 것이 없었다.
//
// 이제 읽음은 "봤다"가 아니라 **"처리했다"** 다: 항목을 눌러 덧글로 갔을 때 그것만 읽음.
//
// 두 값이 함께 판정한다.
//   기준선 `notificationsSeenAt` — 이보다 오래된 것은 무조건 읽음
//   개별   `notificationsReadIds` — 기준선보다 새 것 중 눌러서 처리한 것
// 기준선이 있어야 [모두 읽음] 한 번으로 정리되고, 기존 122건이 되살아나 뱃지가 99+ 로
// 돌아가지 않는다.
import { describe, it, expect } from 'vitest';
import { isUnread, nextReadIds, READ_IDS_CAP } from './notification-read';

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

  // [모두 읽음] 을 한 번도 안 누르면 무한히 자랄 수 있어서 상한을 둔다.
  // 오래된 것부터 버린다 — 어차피 기준선이 올라가면 읽음으로 판정된다.
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
