import { describe, it, expect } from "vitest";
import { isPolite, templateReading, buildPrompt } from "./reading";
import { cardById, type TarotCard } from "./tarot-deck";

const star = cardById(17) as TarotCard; // 별
const tower = cardById(16) as TarotCard; // 탑

describe("isPolite — 반말/존댓말 가드 (#388)", () => {
  it("존댓말 문장은 통과", () => {
    expect(isPolite("오늘은 물러섬이 이로운 날이에요. 마음을 가볍게 해보세요.")).toBe(true);
    expect(isPolite("작은 기쁨을 느껴 보시길 바랍니다.")).toBe(true);
  });

  it("실측에서 샜던 반말(별 카드)을 잡는다", () => {
    // 로컬 LLM 이 실제로 뱉었던 반말 — 존댓말로 시켰는데 새어 나왔다.
    expect(isPolite("별이 너에게 조용한 기운을 보내고 있어. 마음을 가볍게 해보는 게 좋아.")).toBe(false);
  });

  it("반말 어미들을 각각 잡는다", () => {
    expect(isPolite("오늘은 좋을 거야.")).toBe(false);
    expect(isPolite("잊지 말아줘.")).toBe(false);
    expect(isPolite("천천히 해봐.")).toBe(false);
    expect(isPolite("그게 나을걸.")).toBe(false);
  });

  it("빈 문자열은 존댓말 아님(재생성 유도)", () => {
    expect(isPolite("")).toBe(false);
    expect(isPolite("   ")).toBe(false);
  });
});

describe("templateReading — LLM 폴백 (#388)", () => {
  it("정·역방향이 다른 글을 낸다", () => {
    const up = templateReading(star, "up");
    const rev = templateReading(star, "rev");
    expect(up).not.toBe(rev);
    expect(up.length).toBeGreaterThan(20);
  });

  it("항상 존댓말이다 — 폴백이 가드를 스스로 통과해야 한다", () => {
    for (const c of [star, tower]) {
      for (const o of ["up", "rev"] as const) {
        expect(isPolite(templateReading(c, o))).toBe(true);
      }
    }
  });

  it("그 카드의 키워드를 담는다", () => {
    expect(templateReading(star, "up")).toContain("희망");
  });
});

describe("buildPrompt (#388)", () => {
  it("카드 이름·방향·키워드를 프롬프트에 싣는다", () => {
    const msgs = buildPrompt(star, "up");
    const joined = msgs.map((m) => m.content).join("\n");
    expect(joined).toContain("별");
    expect(joined).toContain("희망");
    expect(joined).toContain("정방향");
  });

  it("역방향이면 역방향 키워드를 싣는다", () => {
    const joined = buildPrompt(star, "rev").map((m) => m.content).join("\n");
    expect(joined).toContain("역방향");
    expect(joined).toContain("낙담");
  });

  it("존댓말을 명시적으로 요구한다", () => {
    const joined = buildPrompt(star, "up").map((m) => m.content).join("\n");
    expect(joined).toMatch(/존댓말|\-요|습니다/);
  });
});
