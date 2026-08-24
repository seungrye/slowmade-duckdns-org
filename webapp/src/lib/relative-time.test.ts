import { describe, it, expect } from "vitest";
import { relativeTime } from "./relative-time";

const NOW = new Date("2024-06-15T12:00:00Z");
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe("relativeTime — 60초 미만", () => {
  it("0초 ~ 60초 미만 차이는 '방금'", () => {
    expect(relativeTime(new Date(NOW.getTime()), NOW)).toBe("방금");
    expect(relativeTime(new Date(NOW.getTime() - 30_000), NOW)).toBe("방금");
    expect(relativeTime(new Date(NOW.getTime() - 59_999), NOW)).toBe("방금");
  });

  it("미래 시각은 '방금'", () => {
    expect(relativeTime(new Date(NOW.getTime() + 1), NOW)).toBe("방금");
    expect(relativeTime(new Date(NOW.getTime() + 3 * DAY), NOW)).toBe("방금");
  });
});

describe("relativeTime — 60분 미만", () => {
  it("정각 60초부터 'N분 전'", () => {
    expect(relativeTime(new Date(NOW.getTime() - MIN), NOW)).toBe("1분 전");
    expect(relativeTime(new Date(NOW.getTime() - 90_000), NOW)).toBe("1분 전");
    expect(relativeTime(new Date(NOW.getTime() - 5 * MIN), NOW)).toBe("5분 전");
    expect(relativeTime(new Date(NOW.getTime() - 59 * MIN), NOW)).toBe(
      "59분 전",
    );
  });
});

describe("relativeTime — 24시간 미만", () => {
  it("정각 60분부터 'N시간 전'", () => {
    expect(relativeTime(new Date(NOW.getTime() - HOUR), NOW)).toBe("1시간 전");
    expect(relativeTime(new Date(NOW.getTime() - 5.5 * HOUR), NOW)).toBe(
      "5시간 전",
    );
    expect(relativeTime(new Date(NOW.getTime() - 23 * HOUR), NOW)).toBe(
      "23시간 전",
    );
  });
});

describe("relativeTime — 7일 미만", () => {
  it("정각 24시간부터 'N일 전'", () => {
    expect(relativeTime(new Date(NOW.getTime() - DAY), NOW)).toBe("1일 전");
    expect(relativeTime(new Date(NOW.getTime() - 3 * DAY), NOW)).toBe("3일 전");
    expect(relativeTime(new Date(NOW.getTime() - 6 * DAY), NOW)).toBe("6일 전");
  });
});

describe("relativeTime — 7일 이상", () => {
  it("'YYYY-MM-DD' 형식으로 표시", () => {
    expect(relativeTime(new Date(NOW.getTime() - 7 * DAY), NOW)).toBe(
      "2024-06-08",
    );
    expect(relativeTime("2023-01-02T09:30:00Z", NOW)).toBe("2023-01-02");
    expect(relativeTime("2020-05-10T06:00:00Z", NOW)).toBe("2020-05-10");
  });
});

describe("relativeTime — 입력 타입", () => {
  it("Date 와 ISO 문자열을 동일하게 처리한다", () => {
    const at = new Date(NOW.getTime() - 2 * MIN);
    expect(relativeTime(at.toISOString(), NOW)).toBe("2분 전");
    expect(relativeTime(at.toISOString(), NOW)).toBe(relativeTime(at, NOW));
  });
});
