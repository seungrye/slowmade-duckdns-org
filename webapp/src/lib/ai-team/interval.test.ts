// 야간 러너 주기 판정 (#299).
//
// `OnCalendar=hourly` 로는 안 된다. 유닛이 `Type=oneshot` 이고 아직 activating 인 동안
// 타이머가 elapse 하면 systemd 가 같은 종류의 start job 을 기존 job 에 합쳐 버려 **그
// 트리거가 사라진다.** 90분짜리 실행이면 01:00 트리거가 없어지고 02:00 에야 다시 돈다.
//
// 그래서 타이머는 자주 깨우고 러너가 **경과만** 본다. 밀린 횟수 개념이 없다.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INTERVAL_SEC, parseStamp, shouldRun,
} from '../../../../scripts/ai-team/interval.mjs';

describe('parseStamp — 기준 시각 파일 읽기', () => {
  it('숫자면 그대로 읽는다', () => {
    expect(parseStamp('1787900000')).toBe(1787900000);
  });

  it('앞뒤 공백·개행을 턴다 — 셸로 적으면 개행이 붙는다', () => {
    expect(parseStamp('  1787900000\n')).toBe(1787900000);
  });

  it('소수점은 버린다', () => {
    expect(parseStamp('1787900000.9')).toBe(1787900000);
  });

  // 나쁜 파일 하나로 러너가 영영 멈추면 안 된다. 못 읽으면 null 이고, null 이면 돈다.
  it('못 읽는 것은 전부 null 이다', () => {
    for (const bad of ['', '   ', 'abc', '12abc', '-5', 'NaN', 'Infinity']) {
      expect(parseStamp(bad)).toBeNull();
    }
  });

  it('문자열이 아니면 null', () => {
    // @ts-expect-error 파일에서 읽어 넘기므로 타입이 보장되지 않는다
    expect(parseStamp(null)).toBeNull();
    // @ts-expect-error 위와 같은 이유
    expect(parseStamp(undefined)).toBeNull();
  });
});

describe('shouldRun — 돌아야 하나', () => {
  const 주기 = 3600;

  it('기준이 없으면 돈다 — 첫 실행', () => {
    expect(shouldRun({ now: 1000, last: null, intervalSec: 주기 })).toBe(true);
  });

  it('경과가 주기와 정확히 같으면 돈다', () => {
    expect(shouldRun({ now: 4600, last: 1000, intervalSec: 주기 })).toBe(true);
  });

  it('1초 모자라면 안 돈다', () => {
    expect(shouldRun({ now: 4599, last: 1000, intervalSec: 주기 })).toBe(false);
  });

  it('방금 돌았으면 안 돈다', () => {
    expect(shouldRun({ now: 1000, last: 1000, intervalSec: 주기 })).toBe(false);
  });

  // 3시간짜리 실행이 끝난 직후 첫 깨움. 밀린 3회가 아니라 이번 1회만 돈다 —
  // 호출측이 기준을 지금으로 갱신하므로 다음 1시간은 다시 조용하다.
  it('오래 걸린 실행 뒤에는 곧바로 돈다', () => {
    expect(shouldRun({ now: 1000 + 3 * 3600, last: 1000, intervalSec: 주기 })).toBe(true);
  });

  it('기준이 미래여도 돈다 — 시계가 어긋난 것이지 막을 이유가 아니다', () => {
    expect(shouldRun({ now: 1000, last: 999999, intervalSec: 주기 })).toBe(true);
  });

  it('주기가 이상하면 기본값으로 본다', () => {
    for (const bad of [0, -1, NaN, undefined, null, 'abc']) {
      // 기본값 3600 기준: 3599 경과면 안 돌고 3600 이면 돈다
      expect(shouldRun({ now: 3599, last: 0, intervalSec: bad as never })).toBe(false);
      expect(shouldRun({ now: 3600, last: 0, intervalSec: bad as never })).toBe(true);
    }
  });

  it('기본 주기는 한 시간이다', () => {
    expect(DEFAULT_INTERVAL_SEC).toBe(3600);
  });
});
