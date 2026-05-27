import { Schema, model, models, Model } from "mongoose";

// phases, transitions, spawns 는 구조가 복잡하고 변형이 많아 Mixed로 저장
// (Condition: And/Or/Not/PhaseIs/InZone, Transition: from/trigger/when/actions/to 등)
const QuestSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    giverNpc: { type: String, default: "" },
    initialPhase: { type: String, default: "dormant" },
    // 이번 런에서 퀘스트가 활성화될 확률 (0.0~1.0). 게임 RON 의 spawn_chance 미러.
    // #[serde(default = "default_spawn_chance")] 와 동일하게 기본 1.0.
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
