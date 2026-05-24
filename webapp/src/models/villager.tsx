import { Schema, model, models, Model } from "mongoose";

const VillagerSchema = new Schema(
  {
    // 정체성 키 — 퀘스트 giver_npc / KillNpc 가 참조. name 은 표시용(unique X).
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    color: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) => v.length === 3 && v.every((n) => n >= 0 && n <= 1),
        message: "color 는 [r, g, b] (각 0.0~1.0) 형식이어야 합니다.",
      },
    },
    dialogs: { type: [String], default: [] },
    speed: { type: Number, default: 1.0 },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export interface VillagerDoc {
  _id: unknown;
  id: string;
  name: string;
  color: number[];
  dialogs: string[];
  speed: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const Villager: Model<VillagerDoc> =
  models.Villager || model<VillagerDoc>("Villager", VillagerSchema);

export default Villager;
