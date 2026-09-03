import { describe, it, expect } from "vitest";
import { TAROT_DECK, DECK_SIZE, cardById, keywordsOf, type TarotCard } from "./tarot-deck";

describe("타로 덱 — 단일 출처 무결성 (#388)", () => {
  it("정확히 78장이다", () => {
    expect(DECK_SIZE).toBe(78);
    expect(TAROT_DECK).toHaveLength(78);
  });

  it("메이저 22 + 마이너 56 구성", () => {
    const major = TAROT_DECK.filter((c) => c.arcana === "major");
    expect(major).toHaveLength(22);
    for (const suit of ["wands", "cups", "swords", "pentacles"] as const) {
      expect(TAROT_DECK.filter((c) => c.arcana === suit)).toHaveLength(14);
    }
  });

  it("id 는 0..77 연속·유일하고 배열 인덱스와 일치한다", () => {
    const ids = TAROT_DECK.map((c) => c.id);
    expect(new Set(ids).size).toBe(78);
    TAROT_DECK.forEach((c, i) => expect(c.id).toBe(i));
    expect(Math.min(...ids)).toBe(0);
    expect(Math.max(...ids)).toBe(77);
  });

  it("모든 카드가 필수 필드를 갖는다 — 빈 이름·빈 키워드 없음", () => {
    for (const c of TAROT_DECK) {
      expect(c.nameEn.length).toBeGreaterThan(0);
      expect(c.nameKr.length).toBeGreaterThan(0);
      expect(c.keywordsUp.length).toBeGreaterThan(0);
      expect(c.keywordsRev.length).toBeGreaterThan(0);
      expect(c.image).toBe(`tarot/rws/${c.id}.jpg`);
    }
  });

  it("이름(EN·KR)이 서로 겹치지 않는다", () => {
    expect(new Set(TAROT_DECK.map((c) => c.nameEn)).size).toBe(78);
    expect(new Set(TAROT_DECK.map((c) => c.nameKr)).size).toBe(78);
  });

  it("이미지 키가 유일하다 — 업로드가 서로 덮어쓰지 않는다", () => {
    expect(new Set(TAROT_DECK.map((c) => c.image)).size).toBe(78);
  });

  it("대표 카드가 제자리에 있다", () => {
    expect(cardById(0)?.nameKr).toBe("바보");
    expect(cardById(17)?.nameEn).toBe("The Star");
    expect(cardById(21)?.nameKr).toBe("세계");
  });

  it("keywordsOf 가 방향에 따라 갈린다", () => {
    const star = cardById(17) as TarotCard;
    expect(keywordsOf(star, "up")).toContain("희망");
    expect(keywordsOf(star, "up")).not.toEqual(keywordsOf(star, "rev"));
  });

  it("범위 밖 id 는 undefined", () => {
    expect(cardById(78)).toBeUndefined();
    expect(cardById(-1)).toBeUndefined();
  });
});
