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
    // With hidden=true it is not placed into an ordinary vendor's inventory automatically (a Phase 2 bonus).
    // Absent, it means false (backwards compatible).
    hidden: { type: Boolean, default: undefined },

    // quest only
    imagePath: { type: String },

    // weapon only - the single value (attackPower) stays for compatibility; the random-stat mode uses min/max plus tier.
    attackPower: { type: Number },
    attackPowerMin: { type: Number },
    attackPowerMax: { type: Number },
    element: { type: String, default: null }, // "fire" | "ice" | "lightning" | null

    // armor only
    defenseBonus: { type: Number },
    defenseBonusMin: { type: Number },
    defenseBonusMax: { type: Number },

    // shared by weapon and armor - the drop table's tier (1..=5)
    tier: { type: Number },

    // consumable only
    effect: { type: ConsumableEffectSchema },

    // accessory only - the effect's description (for people)
    desc: { type: String },
    // accessory only - the list of data-driven effect keys. The game code branches on these keys rather than the id.
    // The valid values: "RevealGuardVision" | "RevealTrapsInSight" | "RevealVendorVision" (in sync with AccessoryEffect in types/item.ts).
    effects: { type: [String], default: undefined },

    // The shop system (shared by every kind) - mirroring the game's `Option<u32>`.
    // A missing buyPrice -> not for sale (a vendor never lists it, filtered on the game side in phase 2).
    // A missing sellPrice -> the game computes buyPrice/2 automatically.
    // default: undefined - so Mongoose leaves the key out of the doc entirely and the RON serializer treats it as unset.
    buyPrice: { type: Number, default: undefined },
    sellPrice: { type: Number, default: undefined },

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
  buyPrice?: number;
  sellPrice?: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const Item: Model<ItemDoc> =
  models.Item || model<ItemDoc>("Item", ItemSchema);

export default Item;
