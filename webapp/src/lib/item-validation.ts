import type { ItemKind } from "@/types/item";

const KINDS: ItemKind[] = ["quest", "weapon", "armor", "consumable"];

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
      return { ok: true };
    }
    case "armor": {
      if (typeof body.defenseBonus !== "number") {
        return { ok: false, message: "armor: defenseBonus 는 숫자 필수" };
      }
      return { ok: true };
    }
    case "consumable": {
      const e = body.effect as { type?: unknown; amount?: unknown } | undefined;
      if (!e || e.type !== "Heal" || typeof e.amount !== "number") {
        return { ok: false, message: "consumable: effect { type: 'Heal', amount: number } 필수" };
      }
      return { ok: true };
    }
  }
}
