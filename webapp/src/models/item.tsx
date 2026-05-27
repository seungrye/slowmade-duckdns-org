import { Schema, model, models, Model } from "mongoose";

const ConsumableEffectSchema = new Schema(
  {
    type: { type: String, required: true, enum: ["Heal"] },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const ItemSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    kind: { type: String, required: true, enum: ["quest", "weapon", "armor", "consumable"] },
    displayName: { type: String, required: true },
    glyphAscii: { type: String, required: true },
    glyphUnicode: { type: String, required: true },
    glyphGameIcon: { type: String, required: true },
    pickupMessage: { type: String, required: true },

    // quest 전용
    imagePath: { type: String },

    // weapon 전용 — 단일값(attackPower) 은 호환 유지, random-stat 모드는 min/max + tier.
    attackPower: { type: Number },
    attackPowerMin: { type: Number },
    attackPowerMax: { type: Number },
    element: { type: String, default: null }, // "fire" | "ice" | "lightning" | null

    // armor 전용
    defenseBonus: { type: Number },
    defenseBonusMin: { type: Number },
    defenseBonusMax: { type: Number },

    // weapon/armor 공통 — 드롭 테이블 등급 (1..=5)
    tier: { type: Number },

    // consumable 전용
    effect: { type: ConsumableEffectSchema },

    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export interface ItemDoc {
  _id: unknown;
  id: string;
  kind: "quest" | "weapon" | "armor" | "consumable";
  displayName: string;
  glyphAscii: string;
  glyphUnicode: string;
  glyphGameIcon: string;
  pickupMessage: string;
  imagePath?: string;
  attackPower?: number;
  attackPowerMin?: number;
  attackPowerMax?: number;
  element?: string | null;
  defenseBonus?: number;
  defenseBonusMin?: number;
  defenseBonusMax?: number;
  tier?: number;
  effect?: { type: "Heal"; amount: number };
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const Item: Model<ItemDoc> =
  models.Item || model<ItemDoc>("Item", ItemSchema);

export default Item;
