import { describe, it, expect } from "vitest";
import { fortuneDTO } from "./dto";
import { cardById, type TarotCard } from "./tarot-deck";

const star = cardById(17) as TarotCard;

describe("fortuneDTO (#388)", () => {
  const base = {
    dateKey: "2026-09-03",
    cardId: 17,
    orientation: "up" as const,
    reading: "오늘은 희망이 스미는 하루예요.",
    readingSource: "llm" as const,
    status: "ready" as const,
    seenAt: null,
  };

  it("문서와 카드를 클라이언트 모양으로 합친다", () => {
    const dto = fortuneDTO(base, star, "https://cdn/x/tarot/rws/17.jpg");
    expect(dto.card.nameKr).toBe("별");
    expect(dto.card.imageUrl).toBe("https://cdn/x/tarot/rws/17.jpg");
    expect(dto.card.keywords).toContain("희망");
    expect(dto.reading).toBe("오늘은 희망이 스미는 하루예요.");
    expect(dto.readingSource).toBe("llm");
  });

  it("seen 은 seenAt 유무의 boolean", () => {
    expect(fortuneDTO(base, star, "u").seen).toBe(false);
    expect(fortuneDTO({ ...base, seenAt: new Date() }, star, "u").seen).toBe(true);
  });

  it("역방향이면 역방향 키워드를 싣는다", () => {
    const dto = fortuneDTO({ ...base, orientation: "rev" }, star, "u");
    expect(dto.card.keywords).toEqual(star.keywordsRev);
  });

  it("풀이가 비어 있으면 템플릿으로 채워 빈 화면을 막는다", () => {
    const dto = fortuneDTO({ ...base, reading: "" }, star, "u");
    expect(dto.reading.length).toBeGreaterThan(10);
  });
});
