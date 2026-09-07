import { describe, it, expect } from "vitest";
import { ENDING_IDS } from "@/types/web-adventure";
import WebAdventurePastRun from "@/models/web-adventure-past-run";
import WebAdventureScene from "@/models/web-adventure-scene";
import { endingsMeta, ENDING_LABEL } from "@/content/web-adventure/endings";
import { ENDING_IDS as ACHIEVEMENT_ENDING_IDS } from "@/lib/achievements/rules";
import { ENDING_ORDER } from "@/app/games/web-adventure/gallery/EndingGallery";

/**
 * When the ending list drifts, this is what breaks (#352).
 *
 * #359 and #361 added 5 endings (liberation, usurpation, regency, purge, wayfarer) without fixing the past-run
 * model's mongoose enum. The enum was a hand-copied string array rather than derived from the type, so TypeScript
 * could not catch it, and **for over two weeks every completed run was thrown away as a 500** - feedback notes,
 * the gallery and the achievements with it.
 *
 * Maps declared as Record<EndingId, …> have completeness enforced by the type, so there is no need to check them here.
 * The mongoose enum is **a runtime string array** the type cannot catch - which is why this test exists.
 */
const enumOf = (model: { schema: { path(p: string): unknown } }, path: string): string[] => {
  const p = model.schema.path(path) as { enumValues?: string[]; options?: { enum?: string[] } };
  return p.enumValues ?? p.options?.enum ?? [];
};

describe("엔딩 목록 단일 출처 (#352)", () => {
  it("past-run 모델의 enum 이 ENDING_IDS 와 같다 — 이게 어긋나서 사고가 났다", () => {
    expect([...enumOf(WebAdventurePastRun, "endingId")].sort())
      .toEqual([...ENDING_IDS].sort());
  });

  it("scene 모델의 enum 도 ENDING_IDS 와 같다", () => {
    expect([...enumOf(WebAdventureScene, "endingId")].sort())
      .toEqual([...ENDING_IDS].sort());
  });

  it("업적 수집의 분모가 실제 엔딩 수와 같다 — 다르면 '모든 엔딩' 이 영영 안 열린다", () => {
    expect([...ACHIEVEMENT_ENDING_IDS].sort()).toEqual([...ENDING_IDS].sort());
  });

  it("엔딩마다 메타와 라벨이 있다", () => {
    for (const id of ENDING_IDS) {
      expect(endingsMeta[id], `${id} 메타 없음`).toBeTruthy();
      expect(ENDING_LABEL[id], `${id} 라벨 없음`).toBeTruthy();
    }
  });

  it("갤러리 전시 순서에 모든 엔딩이 있다 — 빠지면 그 카드가 아예 안 보인다", () => {
    expect([...ENDING_ORDER].sort()).toEqual([...ENDING_IDS].sort());
  });

  it("중복이 없다", () => {
    expect(new Set(ENDING_IDS).size).toBe(ENDING_IDS.length);
  });
});
