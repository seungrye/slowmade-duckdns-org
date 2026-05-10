import { InferSchemaType, Schema, model, models } from "mongoose";

const VillagerRevisionSchema = new Schema({
  villagerId: { type: Schema.Types.ObjectId, ref: "Villager", required: true },
  version: { type: Number, required: true },
  villager: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now },
});

export type VillagerRevisionType = InferSchemaType<typeof VillagerRevisionSchema>;

export default models.VillagerRevision ||
  model("VillagerRevision", VillagerRevisionSchema);
