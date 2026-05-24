import { InferSchemaType, Schema, model, models } from "mongoose";

const MonsterRevisionSchema = new Schema({
  monsterId: { type: Schema.Types.ObjectId, ref: "Monster", required: true },
  version: { type: Number, required: true },
  monster: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now },
});

export type MonsterRevisionType = InferSchemaType<typeof MonsterRevisionSchema>;

export default models.MonsterRevision ||
  model("MonsterRevision", MonsterRevisionSchema);
