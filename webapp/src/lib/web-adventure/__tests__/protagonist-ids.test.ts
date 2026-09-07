import { describe, it, expect } from "vitest";
import { PROTAGONIST_IDS } from "@/types/web-adventure";
import { PROTAGONIST_ORDER, protagonists } from "@/content/web-adventure/protagonists";
import { PROTAGONISTS } from "@/lib/achievements/rules";

/**
 * When the protagonist list drifts, this is what breaks (#354).
 *
 * The achievements' denominator was written out separately. In #352 the endings went wrong for exactly this reason -
 * "all endings" opened at 6 when there were really 11.
 */
describe("주인공 목록 단일 출처 (#354)", () => {
  it("업적 분모가 실제 주인공 수와 같다", () => {
    expect([...PROTAGONISTS].sort()).toEqual([...PROTAGONIST_IDS].sort());
  });

  it("전시 순서에 주인공이 빠짐없이 있다", () => {
    expect([...PROTAGONIST_ORDER].sort()).toEqual([...PROTAGONIST_IDS].sort());
  });

  it("주인공마다 메타가 있다", () => {
    for (const id of PROTAGONIST_IDS) expect(protagonists[id], `${id} 메타 없음`).toBeTruthy();
  });
});
