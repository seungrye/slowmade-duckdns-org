// StartLoadout def 검증.
//   - gold >= 0 정수
//   - weapon/armor: null 또는 비어있지 않은 문자열
//   - items: 모든 원소가 비어있지 않은 문자열
//   - consumables: 각 원소가 { id: 비어있지 않은 문자열, count: >= 1 정수 }

import type { StartLoadoutDef } from "@/types/start-loadout";

export type ValidationResult = { ok: true } | { ok: false; message: string };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function validateStartLoadout(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, message: "본문이 객체가 아닙니다." };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.gold !== "number" || !Number.isInteger(b.gold) || b.gold < 0) {
    return { ok: false, message: "gold 는 0 이상 정수여야 합니다." };
  }

  if (b.weapon !== null && b.weapon !== undefined && !isNonEmptyString(b.weapon)) {
    return { ok: false, message: "weapon 은 null 또는 비어있지 않은 문자열이어야 합니다." };
  }

  if (b.armor !== null && b.armor !== undefined && !isNonEmptyString(b.armor)) {
    return { ok: false, message: "armor 는 null 또는 비어있지 않은 문자열이어야 합니다." };
  }

  if (!Array.isArray(b.items)) {
    return { ok: false, message: "items 는 배열이어야 합니다." };
  }
  for (let i = 0; i < b.items.length; i++) {
    if (!isNonEmptyString(b.items[i])) {
      return { ok: false, message: `items[${i}] 는 비어있지 않은 문자열이어야 합니다.` };
    }
  }

  if (!Array.isArray(b.consumables)) {
    return { ok: false, message: "consumables 는 배열이어야 합니다." };
  }
  for (let i = 0; i < b.consumables.length; i++) {
    const c = b.consumables[i];
    if (typeof c !== "object" || c === null) {
      return { ok: false, message: `consumables[${i}] 는 객체여야 합니다.` };
    }
    const co = c as Record<string, unknown>;
    if (!isNonEmptyString(co.id)) {
      return { ok: false, message: `consumables[${i}].id 는 비어있지 않은 문자열이어야 합니다.` };
    }
    if (typeof co.count !== "number" || !Number.isInteger(co.count) || co.count < 1) {
      return { ok: false, message: `consumables[${i}].count 는 1 이상 정수여야 합니다.` };
    }
  }

  return { ok: true };
}

/** body 를 정규화된 StartLoadoutDef 로 변환 (validate 통과 후 사용). */
export function normalizeStartLoadout(body: Record<string, unknown>): StartLoadoutDef {
  return {
    gold: body.gold as number,
    weapon: (body.weapon as string | null | undefined) ?? null,
    armor: (body.armor as string | null | undefined) ?? null,
    items: [...(body.items as string[])],
    consumables: (body.consumables as Array<{ id: string; count: number }>).map(
      (c) => ({ id: c.id, count: c.count }),
    ),
  };
}
