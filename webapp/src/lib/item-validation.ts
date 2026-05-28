import type { ItemKind } from "@/types/item";

const KINDS: ItemKind[] = ["quest", "weapon", "armor", "consumable", "accessory"];

export type ValidationResult = { ok: true } | { ok: false; message: string };

export function validateItemForCreate(body: Record<string, unknown>): ValidationResult {
  const requiredStrings = ["id", "kind", "displayName", "glyphAscii", "glyphUnicode", "glyphGameIcon", "pickupMessage"];
  for (const f of requiredStrings) {
    const v = body[f];
    if (typeof v !== "string" || !v.trim()) {
      return { ok: false, message: `${f} 는 필수 문자열입니다.` };
    }
  }
  if (!KINDS.includes(body.kind as ItemKind)) {
    return { ok: false, message: `지원하지 않는 kind: ${body.kind}` };
  }
  return validateKindFields(body, body.kind as ItemKind);
}

export function validateKindFields(body: Record<string, unknown>, kind: ItemKind): ValidationResult {
  switch (kind) {
    case "quest": {
      if (body.imagePath !== undefined && typeof body.imagePath !== "string") {
        return { ok: false, message: "quest: imagePath 는 문자열이어야 합니다." };
      }
      if (body.imagePath === undefined || body.imagePath === "") {
        return { ok: false, message: "quest: imagePath 필수" };
      }
      return { ok: true };
    }
    case "weapon": {
      if (typeof body.attackPower !== "number") {
        return { ok: false, message: "weapon: attackPower 는 숫자 필수" };
      }
      if (body.element !== undefined && body.element !== null
        && !["fire", "ice", "lightning"].includes(body.element as string)) {
        return { ok: false, message: "weapon: element 는 null 또는 fire/ice/lightning 중 하나" };
      }
      const r = validateRandomStatFields(body, "attackPower");
      if (!r.ok) return r;
      return { ok: true };
    }
    case "armor": {
      if (typeof body.defenseBonus !== "number") {
        return { ok: false, message: "armor: defenseBonus 는 숫자 필수" };
      }
      const r = validateRandomStatFields(body, "defenseBonus");
      if (!r.ok) return r;
      return { ok: true };
    }
    case "consumable": {
      const e = body.effect as { type?: unknown; amount?: unknown } | undefined;
      if (!e || e.type !== "Heal" || typeof e.amount !== "number") {
        return { ok: false, message: "consumable: effect { type: 'Heal', amount: number } 필수" };
      }
      return { ok: true };
    }
    case "accessory": {
      if (body.desc !== undefined && typeof body.desc !== "string") {
        return { ok: false, message: "accessory: desc 는 문자열이어야 합니다." };
      }
      if (body.desc === undefined || body.desc === "") {
        return { ok: false, message: "accessory: desc 필수 (효과 설명)" };
      }
      return { ok: true };
    }
  }
}

/**
 * 무기/방어구 신규 random-stat 필드 검증.
 * - min/max 가 있으면 둘 다 있어야 하고, min ≤ max.
 * - tier 가 있으면 1..=5 정수.
 * 모두 optional 이므로 없으면 ok.
 */
function validateRandomStatFields(
  body: Record<string, unknown>,
  baseKey: "attackPower" | "defenseBonus",
): ValidationResult {
  const minKey = `${baseKey}Min`;
  const maxKey = `${baseKey}Max`;
  const min = body[minKey];
  const max = body[maxKey];
  if (min !== undefined || max !== undefined) {
    if (typeof min !== "number" || typeof max !== "number") {
      return { ok: false, message: `${minKey}/${maxKey} 는 둘 다 숫자여야 합니다.` };
    }
    if (min > max) {
      return { ok: false, message: `${minKey} 는 ${maxKey} 보다 클 수 없습니다.` };
    }
  }
  const tier = body.tier;
  if (tier !== undefined) {
    if (typeof tier !== "number" || !Number.isInteger(tier) || tier < 1 || tier > 5) {
      return { ok: false, message: "tier 는 1..=5 정수여야 합니다." };
    }
  }
  return { ok: true };
}
