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
    kind: {
      type: String,
      required: true,
      enum: ["quest", "weapon", "armor", "consumable", "accessory"],
    },
    displayName: { type: String, required: true },
    glyphAscii: { type: String, required: true },
    glyphGameIcon: { type: String, required: true },
    pickupMessage: { type: String, required: true },
    // hidden=true 면 일반 vendor 인벤토리에 자동 편성되지 않는다 (Phase 2 보너스).
    // 누락 시 false 의미 (기존 호환).
    hidden: { type: Boolean, default: undefined },

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

    // accessory 전용 — 효과 설명 텍스트 (사람용)
    desc: { type: String },
    // accessory 전용 — 데이터 주도 효과 키 목록. 게임 코드가 id 가 아닌 이 키로 분기.
    // 유효 값: "RevealGuardVision" | "RevealTrapsInSight" | "RevealVendorVision" (types/item.ts AccessoryEffect 와 동기).
    effects: { type: [String], default: undefined },

    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export interface ItemDoc {
  _id: unknown;
  id: string;
  kind: "quest" | "weapon" | "armor" | "consumable" | "accessory";
  displayName: string;
  glyphAscii: string;
  glyphGameIcon: string;
  pickupMessage: string;
  hidden?: boolean;
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
  desc?: string;
  effects?: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const Item: Model<ItemDoc> =
  models.Item || model<ItemDoc>("Item", ItemSchema);

export default Item;
