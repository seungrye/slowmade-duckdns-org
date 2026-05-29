import Zone from "@/models/zone";
import { collectNamedZones, collectFromQuest, type QuestLike } from "./zone-extract";

/**
 * 퀘스트 저장/임포트 시점에 quest 정의 안의 Named zone id 들을 Zone 카탈로그에
 * upsert 한다. 사용자가 별도로 zone 페이지에서 손대지 않아도 끊어진 참조
 * 경고가 떠다니지 않도록 보정.
 *
 * - 이미 존재하는 zone 은 건드리지 않는다 (description / generator 보존).
 * - 신규 zone 은 최소 doc 으로 생성:
 *   - **generator 는 같은 quest 의 OpenPortal 에서 이 zone 의 generator 를 그대로
 *     사용**. 매핑이 없으면 fallback `"bsp"` (게임 등록 generator 중 가장 보편적).
 *     사후 zone 페이지에서 수정 가능.
 *   - description 은 빈 문자열.
 *
 * @returns 새로 생성된 zone name 배열 (호출자가 로그/응답에 노출하려면 사용).
 */
const FALLBACK_GENERATOR = "bsp";

export async function upsertNamedZonesFromQuest(quest: QuestLike): Promise<string[]> {
  const names = collectNamedZones(quest);
  if (names.length === 0) return [];

  // OpenPortal 에서 (zone → generator) 매핑 구성. 같은 zone 이 여러 OpenPortal 에
  // 나오면 첫 번째 generator 채택(보통 동일).
  const portalGen = new Map<string, string>();
  for (const p of collectFromQuest(quest)) {
    if (!portalGen.has(p.zone) && p.generator) portalGen.set(p.zone, p.generator);
  }

  const created: string[] = [];
  for (const name of names) {
    const existing = await Zone.findOne({ name }).select("_id").lean();
    if (existing) continue;
    const generator = portalGen.get(name) ?? FALLBACK_GENERATOR;
    try {
      await Zone.create({ name, generator, description: "" });
      created.push(name);
    } catch {
      // 동시 생성으로 unique 위반 시 무시 (다른 요청이 이미 만든 경우)
    }
  }
  return created;
}
