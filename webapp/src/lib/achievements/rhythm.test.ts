import { describe, it, expect } from 'vitest';
import { postRhythm } from './rhythm';

// KST = UTC+9. UTC 15:00 이 KST 다음 날 00:00 이다.
const at = (iso: string) => new Date(iso);

describe('postRhythm — 연속일수', () => {
  it('글이 없으면 0', () => {
    expect(postRhythm([]).streak).toBe(0);
  });

  it('하루만 쓰면 1', () => {
    expect(postRhythm([at('2026-03-15T03:00:00Z')]).streak).toBe(1);
  });

  it('내리 이레면 7', () => {
    const dates = Array.from({ length: 7 }, (_, i) =>
      at(`2026-03-${String(10 + i).padStart(2, '0')}T03:00:00Z`),
    );
    expect(postRhythm(dates).streak).toBe(7);
  });

  it('하루라도 비면 끊긴다 — 가장 긴 구간을 낸다', () => {
    const dates = [
      at('2026-03-10T03:00:00Z'),
      at('2026-03-11T03:00:00Z'),
      // 3-12 없음
      at('2026-03-13T03:00:00Z'),
      at('2026-03-14T03:00:00Z'),
      at('2026-03-15T03:00:00Z'),
    ];
    expect(postRhythm(dates).streak).toBe(3);
  });

  it('같은 날 여러 개를 써도 하루로 센다', () => {
    const dates = [
      at('2026-03-10T01:00:00Z'),
      at('2026-03-10T05:00:00Z'),
      at('2026-03-10T09:00:00Z'),
    ];
    expect(postRhythm(dates).streak).toBe(1);
  });

  it('순서가 뒤죽박죽이어도 맞다', () => {
    const dates = [
      at('2026-03-14T03:00:00Z'),
      at('2026-03-12T03:00:00Z'),
      at('2026-03-13T03:00:00Z'),
    ];
    expect(postRhythm(dates).streak).toBe(3);
  });

  it('KST 로 날짜를 가른다 — UTC 로 세면 하루가 어긋난다', () => {
    // 둘 다 KST 로는 3-15 다(UTC 3-14 15:00 = KST 3-15 00:00).
    const dates = [at('2026-03-14T15:00:00Z'), at('2026-03-15T05:00:00Z')];
    expect(postRhythm(dates).streak).toBe(1);
  });
});

describe('postRhythm — 주말', () => {
  it('토·일에 쓴 것만 센다 (KST 기준)', () => {
    // 2026-03-14(토), 03-15(일), 03-16(월)
    const dates = [
      at('2026-03-14T03:00:00Z'),
      at('2026-03-15T03:00:00Z'),
      at('2026-03-16T03:00:00Z'),
    ];
    expect(postRhythm(dates).weekend).toBe(2);
  });

  it('KST 로 넘어가 주말이 되는 것도 센다', () => {
    // UTC 금요일 2026-03-13 16:00 = KST 토요일 03-14 01:00
    expect(postRhythm([at('2026-03-13T16:00:00Z')]).weekend).toBe(1);
  });
});

describe('postRhythm — 새벽', () => {
  it('KST 0시~5시 사이만 센다', () => {
    const dates = [
      at('2026-03-14T15:30:00Z'), // KST 03-15 00:30 ✓
      at('2026-03-14T19:00:00Z'), // KST 03-15 04:00 ✓
      at('2026-03-14T20:00:00Z'), // KST 03-15 05:00 ✗ (경계 제외)
      at('2026-03-15T03:00:00Z'), // KST 12:00 ✗
    ];
    expect(postRhythm(dates).night).toBe(2);
  });

  it('세 값을 한 번에 낸다 — 목록을 세 번 훑지 않는다', () => {
    const r = postRhythm([at('2026-03-14T16:00:00Z')]); // KST 03-15(일) 01:00
    expect(r).toEqual({ streak: 1, weekend: 1, night: 1 });
  });
});
