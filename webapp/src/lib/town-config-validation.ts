// TownConfig 검증.
//   - size: TOWN_SIZES 중 하나
//   - roads: TOWN_ROADS 중 하나
//   - wealth: TOWN_WEALTHS 중 하나
//   - defenses: TOWN_DEFENSES 중 하나
//   - landmarks: 배열, 각 원소는 TOWN_LANDMARKS 중 하나, 중복 허용 X
//   - fields: boolean
//   - environment: TOWN_ENVIRONMENTS 중 하나 (누락 시 기본 plains)

import {
  TOWN_SIZES, TOWN_ROADS, TOWN_WEALTHS, TOWN_DEFENSES, TOWN_LANDMARKS, TOWN_ENVIRONMENTS,
  TOWN_CONFIG_DEFAULTS,
  type TownConfig, type TownSize, type TownRoads, type TownWealth, type TownDefenses,
  type TownLandmark, type TownEnvironment,
} from "@/types/town-config";

export type ValidationResult = { ok: true } | { ok: false; message: string };

function inEnum<T extends string>(set: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (set as readonly string[]).includes(v);
}

export function validateTownConfig(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "본문이 객체가 아닙니다." };
  }
  const b = body as Record<string, unknown>;

  if (!inEnum(TOWN_SIZES, b.size)) {
    return { ok: false, message: `size 는 ${TOWN_SIZES.join("/")} 중 하나여야 합니다.` };
  }
  if (!inEnum(TOWN_ROADS, b.roads)) {
    return { ok: false, message: `roads 는 ${TOWN_ROADS.join("/")} 중 하나여야 합니다.` };
  }
  if (!inEnum(TOWN_WEALTHS, b.wealth)) {
    return { ok: false, message: `wealth 는 ${TOWN_WEALTHS.join("/")} 중 하나여야 합니다.` };
  }
  if (!inEnum(TOWN_DEFENSES, b.defenses)) {
    return { ok: false, message: `defenses 는 ${TOWN_DEFENSES.join("/")} 중 하나여야 합니다.` };
  }
  if (!Array.isArray(b.landmarks)) {
    return { ok: false, message: "landmarks 는 배열이어야 합니다." };
  }
  const seen = new Set<string>();
  for (let i = 0; i < b.landmarks.length; i++) {
    const v = b.landmarks[i];
    if (!inEnum(TOWN_LANDMARKS, v)) {
      return { ok: false, message: `landmarks[${i}] 는 ${TOWN_LANDMARKS.join("/")} 중 하나여야 합니다.` };
    }
    if (seen.has(v)) {
      return { ok: false, message: `landmarks 에 중복 값(${v}) 이 있습니다.` };
    }
    seen.add(v);
  }
  if (typeof b.fields !== "boolean") {
    return { ok: false, message: "fields 는 boolean 이어야 합니다." };
  }
  // environment 는 신규 필드 — 누락 시 기본 plains 로 보강(하위호환). 명시되었으나
  // enum 외 값이면 실패.
  if (b.environment !== undefined && !inEnum(TOWN_ENVIRONMENTS, b.environment)) {
    return { ok: false, message: `environment 는 ${TOWN_ENVIRONMENTS.join("/")} 중 하나여야 합니다.` };
  }
  return { ok: true };
}

/** body 를 정규화된 TownConfig 로 변환 (validate 통과 후 사용). */
export function normalizeTownConfig(body: Record<string, unknown>): TownConfig {
  const env: TownEnvironment = inEnum(TOWN_ENVIRONMENTS, body.environment)
    ? (body.environment as TownEnvironment)
    : TOWN_CONFIG_DEFAULTS.environment;
  return {
    size: body.size as TownSize,
    roads: body.roads as TownRoads,
    wealth: body.wealth as TownWealth,
    defenses: body.defenses as TownDefenses,
    landmarks: [...(body.landmarks as TownLandmark[])],
    fields: body.fields as boolean,
    environment: env,
  };
}
