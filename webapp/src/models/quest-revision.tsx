import { InferSchemaType, Schema, model, models } from "mongoose";

const QuestRevisionSchema = new Schema({
  questId: { type: Schema.Types.ObjectId, ref: "Quest", required: true },
  version: { type: Number, required: true },
  quest: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now },
});

export type QuestRevisionType = InferSchemaType<typeof QuestRevisionSchema>;

export default models.QuestRevision ||
  model("QuestRevision", QuestRevisionSchema);
