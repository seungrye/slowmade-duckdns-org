import { Schema, model, models, Model } from "mongoose";
import type { Condition, SpawnZone } from "@/types/quest";

const MonsterSchema = new Schema(
  {
    // The identity key - referenced by QuestAction::SpawnMonster. A stable snake_case identifier.
    id: { type: String, required: true, unique: true },
    displayName: { type: String, required: true },
    glyph: { type: String, required: true },
    color: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) => v.length === 3 && v.every((n) => n >= 0 && n <= 1),
        message: "color 는 [r, g, b] (각 0.0~1.0) 형식이어야 합니다.",
      },
    },
    hp: { type: Number, required: true },
    attack: { type: Number, required: true },
    defense: { type: Number, required: true },
    visionRadius: { type: Number, required: true },
    speed: { type: Number, required: true },
    element: { type: String, default: null }, // "fire" | "ice" | "poison" | "lightning" | null
    spawnWeight: { type: Number, default: 1.0 },
    // The list of ZoneIds - stored as Mixed, being a nested structure (lib/ron.ts handles the RON serialisation).
    zones: { type: [Schema.Types.Mixed], default: [] },
    // QuestCondition - stored as Mixed, being recursive (absent, natural spawning is always allowed).
    spawnCondition: { type: Schema.Types.Mixed, default: null },
    questOnly: { type: Boolean, default: false },

    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export interface MonsterDoc {
  _id: unknown;
  id: string;
  displayName: string;
  glyph: string;
  color: number[];
  hp: number;
  attack: number;
  defense: number;
  visionRadius: number;
  speed: number;
  element?: string | null;
  spawnWeight: number;
  zones: SpawnZone[];
  spawnCondition?: Condition | null;
  questOnly: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const Monster: Model<MonsterDoc> =
  models.Monster || model<MonsterDoc>("Monster", MonsterSchema);

export default Monster;
