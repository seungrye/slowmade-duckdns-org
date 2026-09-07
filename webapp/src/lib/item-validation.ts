import type { ItemKind, AccessoryEffect } from "@/types/item";
import { ACCESSORY_EFFECTS } from "@/types/item";

const KINDS: ItemKind[] = ["quest", "weapon", "armor", "consumable", "accessory"];

export type ValidationResult = { ok: true } | { ok: false; message: string };

export function validateItemForCreate(body: Record<string, unknown>): ValidationResult {
  const requiredStrings = ["id", "kind", "displayName", "glyphAscii", "glyphGameIcon", "pickupMessage"];
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
      // effects is optional - without it, it is allowed as a decorative accessory with no effect.
      if (body.effects !== undefined) {
        if (!Array.isArray(body.effects)) {
          return { ok: false, message: "accessory: effects 는 배열이어야 합니다." };
        }
        for (const e of body.effects) {
          if (typeof e !== "string" || !ACCESSORY_EFFECTS.includes(e as AccessoryEffect)) {
            return { ok: false, message: `accessory: 알 수 없는 effect 키: ${String(e)}` };
          }
        }
      }
      return { ok: true };
    }
  }
}

/**
 * Validates the new random-stat fields on weapons and armour.
 * - if min or max is present, both must be, with min <= max.
 * - if tier is present, it is an integer in 1..=5.
 * All are optional, so absent is fine.
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
