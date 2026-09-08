import { Schema, model, models, Model } from "mongoose";

// phases, transitions and spawns are stored as Mixed, their structure being complex and varied
// (Condition: And/Or/Not/PhaseIs/InZone, Transition: from/trigger/when/actions/to and so on)
const QuestSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    giverNpc: { type: String, default: "" },
    initialPhase: { type: String, default: "dormant" },
    // The probability of this quest being active in a run (0.0~1.0). Mirroring the game RON's spawn_chance.
    // 1.0 by default, as with #[serde(default = "default_spawn_chance")].
    spawnChance: { type: Number, default: 1.0 },
    phases: { type: Map, of: Schema.Types.Mixed, default: {} },
    transitions: { type: [Schema.Types.Mixed], default: [] },
    spawns: { type: [Schema.Types.Mixed], default: [] },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export interface QuestDoc {
  _id: unknown;
  id: string;
  title: string;
  giverNpc: string;
  initialPhase: string;
  spawnChance: number;
  phases: Map<string, unknown>;
  transitions: unknown[];
  spawns: unknown[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const Quest: Model<QuestDoc> =
  models.Quest || model<QuestDoc>("Quest", QuestSchema);

export default Quest;
