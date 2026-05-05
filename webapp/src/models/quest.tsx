import { Schema, model, models, Model } from "mongoose";

// phases와 spawns는 구조가 복잡하고 변형이 많아 Mixed로 저장
// (Condition: And/Or/Not/PhaseIs/InZone, Action: Branch ifTrue/ifFalse 등)
const QuestSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    giverNpc: { type: String, default: "" },
    initialPhase: { type: String, default: "dormant" },
    phases: { type: Map, of: Schema.Types.Mixed, default: {} },
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
  phases: Map<string, unknown>;
  spawns: unknown[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const Quest: Model<QuestDoc> =
  models.Quest || model<QuestDoc>("Quest", QuestSchema);

export default Quest;
