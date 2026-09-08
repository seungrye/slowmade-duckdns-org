import { Schema, model, models, Model } from "mongoose";
import { TOWN_LANDMARKS, TOWN_ENVIRONMENTS, type TownLandmark, type TownEnvironment } from "@/types/town-config";

// The single-doc pattern - the collection always holds 0 or 1. _id is the fixed string "default".
// Mapped 1:1 onto the game's `TownOptions` (bevy-rogue).
// It holds the generator options for the starting town (Town, ZoneId::Town).

const TownConfigSchema = new Schema(
  {
    _id: { type: String, default: "default" },
    // A string enum - blocking a wrong value at the model level. Validation checks it once more.
    size:     { type: String, required: true, enum: ["hamlet", "village", "town"], default: "village" },
    roads:    { type: String, required: true, enum: ["radial", "linear", "random"], default: "radial" },
    wealth:   { type: String, required: true, enum: ["poor", "common", "wealthy"], default: "common" },
    defenses: { type: String, required: true, enum: ["none", "wooden", "stone"], default: "none" },
    landmarks: {
      type: [String],
      default: ["inn", "smithy"],
      validate: {
        validator: (arr: string[]) =>
          arr.every((v) => (TOWN_LANDMARKS as readonly string[]).includes(v)),
        message: "landmarks 에 알 수 없는 값이 있습니다.",
      },
    },
    fields:  { type: Boolean, required: true, default: true },
    // New - the Plains/Coastal branch. The docks landmark appears only under Coastal.
    environment: {
      type: String,
      required: true,
      enum: TOWN_ENVIRONMENTS,
      default: "plains" satisfies TownEnvironment,
    },
    // New - the town generation algorithm. Grid by default (the current implementation). Tinykeep and Watabou are stubs.
    algorithm: {
      type: String,
      required: true,
      enum: ["grid", "tinykeep", "watabou"],
      default: "grid",
    },
    version: { type: Number, default: 1 },
  },
  { timestamps: true, _id: false }
);

export type TownAlgorithm = "grid" | "tinykeep" | "watabou";
export const TOWN_ALGORITHMS: readonly TownAlgorithm[] = ["grid", "tinykeep", "watabou"];

export interface TownConfigDoc {
  _id: string;
  size: "hamlet" | "village" | "town";
  algorithm: TownAlgorithm;
  roads: "radial" | "linear" | "random";
  wealth: "poor" | "common" | "wealthy";
  defenses: "none" | "wooden" | "stone";
  landmarks: TownLandmark[];
  fields: boolean;
  environment: TownEnvironment;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const TownConfig: Model<TownConfigDoc> =
  models.TownConfig || model<TownConfigDoc>("TownConfig", TownConfigSchema);

export default TownConfig;
