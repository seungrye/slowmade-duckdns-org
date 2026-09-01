import { describe, it, expect } from "vitest";
import { PROTAGONIST_IDS } from "@/types/web-adventure";
import { PROTAGONIST_ORDER, protagonists } from "@/content/web-adventure/protagonists";
import { PROTAGONISTS } from "@/lib/achievements/rules";

/**
 * 주인공 목록이 어긋나면 여기서 깨진다 (#354).
 *
 * 업적의 분모가 따로 적혀 있었다. #352 에서 엔딩이 정확히 이것 때문에 틀렸다 —
 * 「모든 엔딩」이 6종에서 열렸는데 실제로는 11종이었다.
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
