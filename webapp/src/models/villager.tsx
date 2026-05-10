import { Schema, model, models, Model } from "mongoose";

const VillagerSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    color: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) => v.length === 3 && v.every((n) => n >= 0 && n <= 1),
        message: "color 는 [r, g, b] (각 0.0~1.0) 형식이어야 합니다.",
      },
    },
    dialogs: { type: [String], default: [] },
    questId: { type: String, default: null },
    speed: { type: Number, default: 1.0 },
  },
  { timestamps: true }
);

export interface VillagerDoc {
  _id: unknown;
  name: string;
  color: number[];
  dialogs: string[];
  questId: string | null;
  speed: number;
  createdAt: Date;
  updatedAt: Date;
}

const Villager: Model<VillagerDoc> =
  models.Villager || model<VillagerDoc>("Villager", VillagerSchema);

export default Villager;
