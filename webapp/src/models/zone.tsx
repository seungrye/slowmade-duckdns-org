import { Schema, model, models, Model } from "mongoose";

const ZoneSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    generator: { type: String, required: true },
    description: { type: String, default: "" },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export interface ZoneDoc {
  _id: unknown;
  name: string;
  generator: string;
  description: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const Zone: Model<ZoneDoc> =
  models.Zone || model<ZoneDoc>("Zone", ZoneSchema);

export default Zone;
