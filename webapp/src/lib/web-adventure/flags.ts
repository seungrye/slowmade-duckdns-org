/**
 * character.flags 를 저장 가능한 꼴로 (#356).
 *
 * #256 이 이전 회차의 엔딩을 다음 회차 flags 에 주입하는데 그 키가 점을 포함한다
 * (`world.harmony_kept`). 두 모델이 flags 를 `Map of Boolean` 으로 선언해 뒀는데
 * **MongoDB 는 Map 키에 점을 못 쓴다** — 캐스팅이 실패하면서 문서 전체가 저장되지
 * 않았다. 두 번째 회차부터 무조건 터졌고, 피드백 노트·갤러리·업적이 통째로 날아갔다.
 *
 * 키는 **그대로 둔다.** 바꾸면 씬 조건과 기존 저장이 전부 어긋난다. 대신 스키마를
 * 점을 견디는 타입으로 바꾸고(MongoDB 5.0+ 는 필드 이름의 점을 허용한다), 값만
 * boolean 으로 정리한다 — 예전에 Map 이 해 주던 일이다.
 */
export function flagsForStore(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = Boolean(v);
  return out;
}
