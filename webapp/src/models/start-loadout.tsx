import { Schema, model, models, Model } from "mongoose";

// The single-doc pattern - the collection always holds 0 or 1. _id is the fixed string "default".
// Mapped 1:1 onto the game's StartLoadout. weapon and armor are null when None.

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
