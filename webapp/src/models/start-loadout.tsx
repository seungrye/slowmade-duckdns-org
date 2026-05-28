import { Schema, model, models, Model } from "mongoose";

// 단일 doc 패턴 — collection 에 항상 0개 또는 1개. _id 는 고정 문자열 "default".
// 게임 측 StartLoadout 과 1:1 매핑. weapon/armor 는 None 시 null.

const ConsumableEntrySchema = new Schema(
  {
    id: { type: String, required: true },
    count: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const StartLoadoutSchema = new Schema(
  {
    _id: { type: String, default: "default" },
    gold: { type: Number, required: true, default: 0, min: 0 },
    weapon: { type: String, default: null }, // null 이면 미장착
    armor: { type: String, default: null },
    items: { type: [String], default: [] },
    consumables: { type: [ConsumableEntrySchema], default: [] },
    version: { type: Number, default: 1 },
  },
  { timestamps: true, _id: false }
);

export interface StartLoadoutDoc {
  _id: string;
  gold: number;
  weapon: string | null;
  armor: string | null;
  items: string[];
  consumables: { id: string; count: number }[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const StartLoadout: Model<StartLoadoutDoc> =
  models.StartLoadout || model<StartLoadoutDoc>("StartLoadout", StartLoadoutSchema);

export default StartLoadout;
