import type { Condition, SpawnZone } from "@/types/quest";

/** SpawnZone 을 한글 라벨로. */
export function zoneLabel(zone: SpawnZone): string {
  if (zone.type === "Town") return "마을";
  // 표준 Named id 에는 친근한 한글 라벨
  switch (zone.id) {
    case "forest":           return "숲";
    case "mountain_village": return "산속 마을";
    case "seaside_harbor":   return "항구 마을";
    default: {
      const m = /^dungeon_(\d+)$/.exec(zone.id);
      if (m) return `던전 ${m[1]}층`;
      return zone.id;
    }
  }
}

/**
 * 조건을 사람이 읽을 수 있는 짧은 한글 문구로 요약한다.
 * `undefined` / `Always` / `And([])` 는 "무조건".
 */
export function conditionSummary(cond?: Condition): string {
  if (!cond) return "무조건";
  switch (cond.type) {
    case "Always":  return "무조건";
    case "HasItem": return `${cond.itemId} 보유`;
    case "HasFlag": return `플래그 ${cond.flag}`;
    case "FlagIs":  return `${cond.flag}=${cond.value}`;
    case "PhaseIs": return `${cond.quest}=${cond.phase}`;
    case "InZone":  return `${zoneLabel(cond.zone)} 위치`;
    case "Not":     return `!(${conditionSummary(cond.condition)})`;
    case "And":     return cond.conditions.length === 0
                      ? "무조건"
                      : cond.conditions.map(conditionSummary).join(" & ");
    case "Or":      return cond.conditions.length === 0
                      ? "무조건"
                      : cond.conditions.map(conditionSummary).join(" | ");
  }
}

/** 엣지 라벨용: 트리거 + 조건 요약 (길면 말줄임). */
export function transitionLabel(trigger: "Interact" | "Auto", when?: Condition): string {
  const t = trigger === "Auto" ? "자동" : "대화";
  const s = conditionSummary(when);
  const short = s.length > 22 ? `${s.slice(0, 21)}…` : s;
  return `${t}: ${short}`;
}
