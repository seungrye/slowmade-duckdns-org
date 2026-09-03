import { describe, it, expect } from "vitest";
import { drawDailyCard } from "./draw";
import { DECK_SIZE } from "./tarot-deck";

describe("drawDailyCard — 결정론적 하루 뽑기 (#388)", () => {
  it("같은 (사용자, 날짜)면 항상 같은 카드·방향", () => {
    const a = drawDailyCard("seungrye@example.com", "2026-09-03");
    const b = drawDailyCard("seungrye@example.com", "2026-09-03");
    expect(a).toEqual(b);
  });

  it("날짜가 바뀌면 대개 다른 결과 (배치 실패해도 카드는 이 함수로 고정)", () => {
    const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"];
    const cards = days.map((d) => drawDailyCard("seungrye@example.com", d).cardId);
    expect(new Set(cards).size).toBeGreaterThan(1);
  });

  it("사용자가 다르면 대개 다른 카드", () => {
    const users = ["a@x.com", "b@x.com", "c@x.com", "d@x.com"];
    const cards = users.map((u) => drawDailyCard(u, "2026-09-03").cardId);
    expect(new Set(cards).size).toBeGreaterThan(1);
  });

  it("cardId 는 항상 0..77 범위", () => {
    for (let i = 0; i < 200; i++) {
      const { cardId } = drawDailyCard(`user${i}@x.com`, "2026-09-03");
      expect(cardId).toBeGreaterThanOrEqual(0);
      expect(cardId).toBeLessThan(DECK_SIZE);
      expect(Number.isInteger(cardId)).toBe(true);
    }
  });

  it("orientation 은 up|rev 이고 둘 다 등장한다", () => {
    const ors = new Set<string>();
    for (let i = 0; i < 200; i++) ors.add(drawDailyCard(`u${i}@x.com`, "2026-09-03").orientation);
    expect([...ors].every((o) => o === "up" || o === "rev")).toBe(true);
    expect(ors.size).toBe(2);
  });

  it("분포가 한 카드에 쏠리지 않는다 (78장에 대략 퍼짐)", () => {
    const counts = new Map<number, number>();
    for (let i = 0; i < 780; i++) {
      const { cardId } = drawDailyCard(`spread${i}@x.com`, "2026-09-03");
      counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
    }
    // 780번 뽑아 최소 50종 이상은 나와야(완전 편향 아님)
    expect(counts.size).toBeGreaterThan(50);
  });
});
