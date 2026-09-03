import { describe, it, expect } from "vitest";
import { buildSajuPrompt, templateSajuReading, sajuContext, computeSaju, todayIljin } from "./saju";
import { isPolite } from "./reading";

const ctx = () => sajuContext(
  computeSaju(new Date("1993-06-15T00:00:00.000Z")),
  todayIljin(new Date("2026-09-03T03:00:00Z")).pillar,
);

describe("사주 풀이 프롬프트·템플릿 (#390)", () => {
  it("프롬프트에 일간 오행·오늘 기운·관계가 실린다", () => {
    const joined = buildSajuPrompt(ctx()).map((m) => m.content).join("\n");
    expect(joined).toContain("日干");
    expect(joined).toMatch(/목|화|토|금|수/);
    expect(joined).toMatch(/비화|식상|인성|재성|관성/);
    expect(joined).toMatch(/존댓말|습니다/);
  });

  it("템플릿 폴백은 항상 존댓말이다", () => {
    // 다양한 관계에서 존댓말 가드를 스스로 통과해야 한다.
    for (const iso of ["1990-01-10", "1985-07-20", "2001-03-03", "1978-11-30"]) {
      const c = sajuContext(computeSaju(new Date(`${iso}T00:00:00.000Z`)), todayIljin(new Date("2026-09-03T03:00:00Z")).pillar);
      expect(isPolite(templateSajuReading(c))).toBe(true);
    }
  });

  it("sajuContext 가 일진 라벨·관계를 채운다", () => {
    const c = ctx();
    expect(c.iljinKr).toContain("(");
    expect(["비화","식상","인성","재성","관성"]).toContain(c.relation.key);
  });
});
