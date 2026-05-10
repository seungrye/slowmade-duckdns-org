import { InferSchemaType, Schema, model, models } from "mongoose";

const ZoneRevisionSchema = new Schema({
  zoneId: { type: Schema.Types.ObjectId, ref: "Zone", required: true },
  version: { type: Number, required: true },
  zone: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now },
});

export type ZoneRevisionType = InferSchemaType<typeof ZoneRevisionSchema>;

export default models.ZoneRevision ||
  model("ZoneRevision", ZoneRevisionSchema);
