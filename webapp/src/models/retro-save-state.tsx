// RetroSaveState - the save state kept on the server (#114).
//
// Attached to the account rather than the browser (IndexedDB). It survives a change of browser, and saving on a phone and continuing
// on a PC works.
//
// **One slot per game.** EmulatorJS's native "Load State" button takes no argument, so
// several slots would mean drawing our own UI inside the iframe - throwing away the very benefit of this design,
// which is using the native UI as it is. Saving overwrites the previous one.
//
// **This is the one place that is not a soft delete.** Overwriting is what a save is, and setting a flag alone would clash with the
// unique index below when saving again for the same (user, game). The MinIO object is kept instead.

import { Schema, model, models, Model, Types } from "mongoose";

export interface RetroSaveStateDoc {
  _id: Types.ObjectId;
  userEmail: string;
  /** `builtin:<slug>` or `rom:<id>` - built and validated by `lib/retro/game-key.ts`. */
  gameKey: string;
  size: number;
  objectKey: string;
  /** The screen at the moment of saving. EmulatorJS supplies it with the saveState event. */
  shotKey?: string;
  shotFormat?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RetroSaveStateSchema = new Schema<RetroSaveStateDoc>(
  {
    userEmail: { type: String, required: true },
    gameKey: { type: String, required: true },
    size: { type: Number, required: true },
    objectKey: { type: String, required: true },
    shotKey: { type: String },
    shotFormat: { type: String },
  },
  { timestamps: true },
);

// One per game - saving is an upsert over this index.
RetroSaveStateSchema.index({ userEmail: 1, gameKey: 1 }, { unique: true });

const RetroSaveState =
  (models.RetroSaveState as Model<RetroSaveStateDoc>) ||
  model<RetroSaveStateDoc>("RetroSaveState", RetroSaveStateSchema);

export default RetroSaveState;
