import type { Condition, SpawnZone } from "@/types/quest";

/** A SpawnZone as a Korean label. */
export function zoneLabel(zone: SpawnZone): string {
  if (zone.type === "Town") return "마을";
  // Friendly Korean labels for the standard Named ids
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
 * Summarises a condition as a short, human-readable Korean phrase.
 * `undefined`, `Always` and `And([])` all become "무조건".
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

/** For an edge label: the trigger plus a condition summary (truncated when long). */
export function transitionLabel(
  trigger: "Interact" | "Auto" | "EnterNpcFov" | "HoldingItemInNpcFov",
  when?: Condition,
): string {
  const t =
    trigger === "Auto" ? "자동"
      : trigger === "EnterNpcFov" ? "시야"
      : trigger === "HoldingItemInNpcFov" ? "시야+소지"
      : "대화";
  const s = conditionSummary(when);
  const short = s.length > 22 ? `${s.slice(0, 21)}…` : s;
  return `${t}: ${short}`;
}
