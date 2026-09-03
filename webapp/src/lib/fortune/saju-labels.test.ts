import { describe, it, expect } from "vitest";
import { GAN, ZHI, GAN_KR, ZHI_EL, EL_COLOR, ELEMENTS, meaningOf } from "./saju-labels";

describe("사주 라벨 단일 출처 (#393)", () => {
  it("천간 10 · 지지 12", () => {
    expect(Object.keys(GAN)).toHaveLength(10);
    expect(Object.keys(ZHI)).toHaveLength(12);
  });

  it("모든 글자에 한글·오행·뜻이 있다", () => {
    for (const [h, v] of [...Object.entries(GAN), ...Object.entries(ZHI)]) {
      expect(v.kr.length).toBeGreaterThan(0);
      expect(ELEMENTS).toContain(v.el);
      expect(v.meaning.length).toBeGreaterThan(5);
      expect(h.length).toBe(1); // 한자 한 글자
    }
  });

  it("파생 맵이 원본과 일치한다", () => {
    expect(GAN_KR["壬"]).toBe("임");
    expect(ZHI_EL["戌"]).toBe("토");
  });

  it("오행마다 색이 있다", () => {
    for (const el of ELEMENTS) expect(EL_COLOR[el]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("meaningOf 가 천간·지지 어느 쪽이든 찾는다", () => {
    expect(meaningOf("壬")).toContain("강");
    expect(meaningOf("戌")).toContain("개");
    expect(meaningOf("?")).toBe("");
  });
});
