import { describe, it, expect } from "vitest";
import { ENDING_IDS } from "@/types/web-adventure";
import WebAdventurePastRun from "@/models/web-adventure-past-run";
import WebAdventureScene from "@/models/web-adventure-scene";
import { endingsMeta, ENDING_LABEL } from "@/content/web-adventure/endings";
import { ENDING_IDS as ACHIEVEMENT_ENDING_IDS } from "@/lib/achievements/rules";
import { ENDING_ORDER } from "@/app/games/web-adventure/gallery/EndingGallery";

/**
 * 엔딩 목록이 어긋나면 여기서 깨진다 (#352).
 *
 * #359·#361 이 엔딩 5종(liberation·usurpation·regency·purge·wayfarer)을 추가하면서
 * past-run 모델의 mongoose enum 만 안 고쳤다. enum 이 타입에서 파생된 게 아니라 문자열
 * 배열을 손으로 복사해 둔 구조라 TypeScript 가 못 잡았고, **2주 넘게 모든 완주 기록이
 * 500 으로 버려졌다** — 피드백 노트·갤러리·업적까지 통째로.
 *
 * Record<EndingId, …> 로 선언한 맵들은 타입이 완전성을 강제하므로 여기서 또 볼 필요가 없다.
 * mongoose enum 은 **런타임 문자열 배열**이라 타입이 못 잡는다 — 그래서 이 테스트가 있다.
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
