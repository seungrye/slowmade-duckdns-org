// WebAdventureSave - the save of Web Adventure CYOA's *run in progress* (#237).
//
// The week 5 milestone - autosave (debounced by 1 second) unified across logged-in and logged-out play.
// One save per user (userEmail). On reaching an ending it moves to a past run and the save is reset
// (the run system is implemented in #239).

import { Schema, model, models, Model } from 'mongoose';

const StatsSchema = new Schema(
  {
    str: { type: Number, required: true },
    dex: { type: Number, required: true },
    int: { type: Number, required: true },
    cha: { type: Number, required: true },
    con: { type: Number, required: true },
    wis: { type: Number, required: true },
  },
  { _id: false },
);

const CharacterSchema = new Schema(
  {
    stats: { type: StatsSchema, required: true },
    hp: { type: Number, required: true },
    maxHp: { type: Number, required: true },
    ability: { type: String, required: true },
    // #287 Eternia - the protagonist's identity plus the contamination. Under strict mode a field missing from the schema
    //   *disappears* at serialisation -> the run's information is lost after a RESTORE. It must be stated.
    protagonist: { type: String, required: true }, // kael | rin | solwen
    stigmaErosion: { type: Number, required: true, min: 0, max: 100 },
    inventory: { type: [String], required: true, default: [] },
    // flags: an arbitrary string key -> boolean. Mongoose's Map<Boolean>.
    // #356 - not a Map. The world.* flags' keys contain **dots**, and MongoDB cannot use a dot
    //   in a Map key. Because of that the whole document stopped being stored from the second run on.
    //   The code never uses it as a Map - it always reads character.flags[key].
    flags: { type: Schema.Types.Mixed, default: {} },
    rerollsLeft: { type: Number, required: true },
  },
  { _id: false },
);

const WebAdventureSaveSchema = new Schema(
  {
    userEmail: { type: String, required: true, unique: true, index: true },
    runIndex: { type: Number, required: true, min: 1 },
    character: { type: CharacterSchema, required: true },
    currentSceneId: { type: String, required: true },
  },
  { timestamps: true },
);

export interface WebAdventureSaveDoc {
  _id: unknown;
  userEmail: string;
  runIndex: number;
  character: {
    stats: { str: number; dex: number; int: number; cha: number; con: number; wis: number };
    hp: number;
    maxHp: number;
    ability: string;
    protagonist: string;
    stigmaErosion: number;
    inventory: string[];
    flags: Map<string, boolean> | Record<string, boolean>;
    rerollsLeft: number;
  };
  currentSceneId: string;
  createdAt: Date;
  updatedAt: Date;
}

const WebAdventureSave: Model<WebAdventureSaveDoc> =
  (models.WebAdventureSave as Model<WebAdventureSaveDoc> | undefined) ??
  model<WebAdventureSaveDoc>('WebAdventureSave', WebAdventureSaveSchema);

export default WebAdventureSave;
