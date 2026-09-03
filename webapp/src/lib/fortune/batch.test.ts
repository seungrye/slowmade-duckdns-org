import { describe, it, expect } from "vitest";
import { shouldRunBatch, kstHour } from "./batch";

describe("shouldRunBatch — 밤 배치 시간 게이트 (#388)", () => {
  it("새벽 시각 이전이면 안 돌린다", () => {
    expect(shouldRunBatch(3, null, "2026-09-03", 4)).toBe(false);
    expect(shouldRunBatch(0, null, "2026-09-03", 4)).toBe(false);
  });

  it("새벽 지나고 오늘 안 돌렸으면 돌린다", () => {
    expect(shouldRunBatch(4, null, "2026-09-03", 4)).toBe(true);
    expect(shouldRunBatch(9, "2026-09-02", "2026-09-03", 4)).toBe(true);
  });

  it("오늘 이미 돌렸으면 안 돌린다(중복 방지)", () => {
    expect(shouldRunBatch(9, "2026-09-03", "2026-09-03", 4)).toBe(false);
  });

  it("재시작으로 lastRun 이 null 이면 다시 돌린다(멱등 catch-up)", () => {
    expect(shouldRunBatch(12, null, "2026-09-03", 4)).toBe(true);
  });
});

describe("kstHour — UTC+9 고정(한국 DST 없음)", () => {
  it("UTC 0시 → KST 9시", () => {
    expect(kstHour(new Date("2026-09-03T00:00:00Z"))).toBe(9);
  });
  it("UTC 20시 → KST 익일 5시(자정 넘김)", () => {
    expect(kstHour(new Date("2026-09-03T20:00:00Z"))).toBe(5);
  });
  it("UTC 15시 → KST 자정(0시)", () => {
    expect(kstHour(new Date("2026-09-03T15:00:00Z"))).toBe(0);
  });
});
