import { InferSchemaType, Schema, model, models, Model } from "mongoose";

const ConditionSchema = new Schema(
  {
    type: { type: String, required: true },
    flag: String,
    value: String,
    itemId: String,
  },
  { _id: false }
);

const ActionSchema = new Schema(
  {
    type: { type: String, required: true },
    phaseId: String,
    text: String,
    itemId: String,
    flag: String,
    value: String,
    npcId: String,
    branches: [
      new Schema(
        {
          condition: ConditionSchema,
          phaseId: String,
        },
        { _id: false }
      ),
    ],
  },
  { _id: false }
);

const AutoAdvanceSchema = new Schema(
  {
    condition: { type: ConditionSchema, required: true },
    nextPhase: { type: String, required: true },
  },
  { _id: false }
);

const SpawnZoneSchema = new Schema(
  {
    type: { type: String, required: true },
    level: Number,
    mapId: String,
  },
  { _id: false }
);

const QuestSpawnSchema = new Schema(
  {
    phase: { type: String, required: true },
    item: { type: String, required: true },
    zone: { type: SpawnZoneSchema, required: true },
  },
  { _id: false }
);

const QuestPhaseDefSchema = new Schema(
  {
    dialog: { type: [String], default: [] },
    on_interact: { type: [ActionSchema], default: [] },
    auto_advance: { type: [AutoAdvanceSchema], default: [] },
    objective: { type: String, default: null },
    position: new Schema({ x: Number, y: Number }, { _id: false }),
  },
  { _id: false }
);

const QuestSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    giverNpc: { type: String, required: true },
    initialPhase: { type: String, required: true },
    phases: { type: Map, of: QuestPhaseDefSchema, default: {} },
    spawns: { type: [QuestSpawnSchema], default: [] },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export type QuestType = InferSchemaType<typeof QuestSchema>;

const Quest: Model<QuestType> =
  models.Quest || model<QuestType>("Quest", QuestSchema);

export default Quest;
