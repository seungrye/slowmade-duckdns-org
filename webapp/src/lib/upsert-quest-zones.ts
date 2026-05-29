import Zone from "@/models/zone";
import { collectNamedZones, type QuestLike } from "./zone-extract";

/**
 * 퀘스트 저장/임포트 시점에 quest 정의 안의 Named zone id 들을 Zone 카탈로그에
 * upsert 한다. 사용자가 별도로 zone 페이지에서 손대지 않아도 끊어진 참조
 * 경고가 떠다니지 않도록 보정.
 *
 * - 이미 존재하는 zone 은 건드리지 않는다 (description / generator 보존).
 * - 신규 zone 은 최소 doc 으로 생성: generator 는 "default" 로 (zone 페이지에서
 *   사후 수정 가능). description 은 빈 문자열.
 *
 * @returns 새로 생성된 zone name 배열 (호출자가 로그/응답에 노출하려면 사용).
 */
export async function upsertNamedZonesFromQuest(quest: QuestLike): Promise<string[]> {
  const names = collectNamedZones(quest);
  if (names.length === 0) return [];

  const created: string[] = [];
  for (const name of names) {
    const existing = await Zone.findOne({ name }).select("_id").lean();
    if (existing) continue;
    try {
      await Zone.create({ name, generator: "default", description: "" });
      created.push(name);
    } catch {
      // 동시 생성으로 unique 위반 시 무시 (다른 요청이 이미 만든 경우)
    }
  }
  return created;
}
