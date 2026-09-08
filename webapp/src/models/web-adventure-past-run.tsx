// WebAdventurePastRun - the record stored when a run ends in an ending (#239).
//
// The save's in-progress run moves to this collection when an ending is reached and the save is recreated
// with runIndex+1 (the run system). Used by the gallery and the statistics.

import { Schema, model, models, Model } from 'mongoose';
// The single source of the ending list (#352). A relative path rather than the alias (@/) - this model is loaded
// by the scripts/*.mjs that run through jiti (migrate-web-adventure-scenes and the like) too.
import { ENDING_IDS, type EndingId } from '../types/web-adventure';

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
    // #287 Eternia - the protagonist's identity plus the contamination. Preserved in the snapshot.
    protagonist: { type: String, required: true }, // kael | rin | solwen
    stigmaErosion: { type: Number, required: true, min: 0, max: 100 },
    inventory: { type: [String], required: true, default: [] },
    // #356 - not a Map. The world.* flags' keys contain **dots**, and MongoDB cannot use a dot
    //   in a Map key. Because of that the whole document stopped being stored from the second run on.
    //   The code never uses it as a Map - it always reads character.flags[key].
    flags: { type: Schema.Types.Mixed, default: {} },
    rerollsLeft: { type: Number, required: true },
  },
  { _id: false },
);

const WebAdventurePastRunSchema = new Schema(
  {
    userEmail: { type: String, required: true, index: true },
    runIndex: { type: Number, required: true, min: 1 },
    // #90 - which prose style that run was read in. For tracing the source of a sentence a note quotes.
    voice: { type: String, default: '' },
    endingId: {
      type: String,
      required: true,
      // #352 - it used to be a hand-copied list. When the 5 endings were added this alone did not follow,
      //   and every run ending in one of them was discarded as a validation failure. It now uses the single source.
      enum: [...ENDING_IDS],
    },
    finalSceneId: { type: String, required: true },
    // The sequence of scene ids passed from start to end (for the path distribution statistics). Absent from the old data.
    scenePath: { type: [String], default: [] },
    // #9 - the rich narrative log at the ending (the choice, body and roll text). Input for the feedback note's LLM.
    //   The client's GameState.log is stored as it is. Absent from the old data.
    log: { type: [String], default: [] },
    character: { type: CharacterSchema, required: true },
    // #63 - the unique id the client makes per run. The idempotency key so the app's retry queue (#61) stores the same run
    //   only once even when it resends it. Absent on the web and in the old data, hence the empty-string default.
    clientRunId: { type: String, default: '' },
    completedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

// The unique compound index so one user's same runIndex is not stored twice.
WebAdventurePastRunSchema.index({ userEmail: 1, runIndex: 1 }, { unique: true });

// The idempotency key - unique only among documents that have a value. Existing documents and web runs hold an empty string and are excluded
// (without partial, the empty strings clash and storing is blocked from the second run on).
WebAdventurePastRunSchema.index(
  { userEmail: 1, clientRunId: 1 },
  { unique: true, partialFilterExpression: { clientRunId: { $gt: '' } } },
);

export interface WebAdventurePastRunDoc {
  _id: unknown;
  userEmail: string;
  runIndex: number;
  endingId: EndingId;
  /** #90 - the style that run was read in. An empty string when unrecorded. */
  voice?: string;
  finalSceneId: string;
  scenePath: string[];
  log: string[];
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
  completedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WebAdventurePastRun: Model<WebAdventurePastRunDoc> =
  (models.WebAdventurePastRun as Model<WebAdventurePastRunDoc> | undefined) ??
  model<WebAdventurePastRunDoc>('WebAdventurePastRun', WebAdventurePastRunSchema);

export default WebAdventurePastRun;
