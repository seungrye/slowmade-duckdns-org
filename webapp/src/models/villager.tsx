import { Schema, model, models, Model } from "mongoose";
import type { ZoneIdValue } from "@/types/zone";
import { HOME_LANDMARKS, type HomeLandmark } from "@/types/villager";

// The sub-schema holding a villager's `homeZone` middle tag (`{ type: "Town" }` | `{ type: "Named", id: ... }`).
// _id: false - no automatic _id is created for the sub-document.
//
// validate: the whitelist of ZoneIdValue's variants. Kept in sync with the game's `ZoneId` enum -
// only `Town` is static; the rest are all expressed as `Named(id)` (including forest/dungeon_<N>/
// mountain_village/seaside_harbor).
const ZoneIdSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["Town", "Named"],
    },
    // Named("…")'s identifier - meaningful only when type === "Named".
    id: { type: String, default: undefined },
  },
  { _id: false },
);

const VillagerSchema = new Schema(
  {
    // The identity key - referenced by a quest's giver_npc and KillNpc. name is for display (not unique).
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    color: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) => v.length === 3 && v.every((n) => n >= 0 && n <= 1),
        message: "color 는 [r, g, b] (각 0.0~1.0) 형식이어야 합니다.",
      },
    },
    dialogs: { type: [String], default: [] },
    speed: { type: Number, default: 1.0 },
    // Mirroring the game RON's stationary/vendor - #[serde(default)], so false by default.
    stationary: { type: Boolean, default: false },
    vendor: { type: Boolean, default: false },
    // Mirroring the game RON's home_zone - the same default as #[serde(default = "Town")].
    // Left unset, they are placed in the starting town (Town) automatically (keeping the previous behaviour).
    homeZone: { type: ZoneIdSchema, default: () => ({ type: "Town" }) },
    // Mirroring the game RON's home_landmark - #[serde(default)] HomeLandmark::Random.
    // It says where in the Town zone the villager spawns. 6 landmarks plus Road and Random.
    // In a zone that is not Town, or when that landmark is inactive (absent from TownConfig.landmarks),
    // the game falls back to Random.
    homeLandmark: {
      type: String,
      enum: HOME_LANDMARKS,
      default: "random" satisfies HomeLandmark,
    },
    // Mirroring the game RON's free_roam - #[serde(default)] free_roam: false.
    // false confines them to their home area (the landmark, named house or road). true lets them roam freely.
    freeRoam: { type: Boolean, default: false },
    // Mirroring the game RON's vendor_vision_radius - the serialisation of an Option<u32>.
    // null/undefined -> the game's fallback default (6 tiles).
    // An integer (>= 0) -> that radius applies to that vendor alone (market_owner = 2, for instance).
    // Ignored on an NPC with vendor=false (the overlay is drawn for vendors only).
    vendorVisionRadius: { type: Number, default: null },
    // The shop inventory - the list of item ids a vendor sells (an Option<Vec<String>>).
    //   undefined -> the key is not stored -> vendor_inventory is not emitted in the RON -> the game falls back to SHOP_CATALOG.
    //   []        -> an empty array is stored -> `vendor_inventory: Some([])` is emitted -> an explicitly empty shop.
    //   [...]     -> that list of ids is stored -> `vendor_inventory: Some([...])` is emitted.
    // default: undefined - so Mongoose leaves the key out of the doc entirely and the RON serializer omits it.
    vendorInventory: { type: [String], default: undefined },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export interface VillagerDoc {
  _id: unknown;
  id: string;
  name: string;
  color: number[];
  dialogs: string[];
  speed: number;
  stationary: boolean;
  vendor: boolean;
  homeZone: ZoneIdValue;
  homeLandmark: HomeLandmark;
  freeRoam: boolean;
  /**
   * A vendor's vision radius - null means the game's default (6). Ignored when vendor=false.
   * Mirroring the game's `Option<u32>` (Schema default = null).
   */
  vendorVisionRadius: number | null;
  /**
   * The shop inventory - the list of item ids a vendor sells (an Option<Vec<String>>).
   * undefined -> the game's SHOP_CATALOG fallback. [] -> an empty shop. [...] -> those ids alone.
   */
  vendorInventory?: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const Villager: Model<VillagerDoc> =
  models.Villager || model<VillagerDoc>("Villager", VillagerSchema);

export default Villager;
