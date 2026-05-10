import { InferSchemaType, Schema, model, models } from "mongoose";

const ItemRevisionSchema = new Schema({
  itemId: { type: Schema.Types.ObjectId, ref: "Item", required: true },
  version: { type: Number, required: true },
  item: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now },
});

export type ItemRevisionType = InferSchemaType<typeof ItemRevisionSchema>;

export default models.ItemRevision ||
  model("ItemRevision", ItemRevisionSchema);
