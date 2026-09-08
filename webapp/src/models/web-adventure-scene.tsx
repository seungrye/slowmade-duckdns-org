// WebAdventureScene - the Web MUD CYOA scene's mongo model.
//
// Phase B (#212): the 18 static ts scenes moved 100% into mongo.
// The client fetches the whole scene content, cacheable, from the
// `/api/web-adventure/content/v1` endpoint (introduced in Phase C).
//
// The schema mirrors the Scene type in src/types/web-adventure.ts 1:1.
// A Choice's per-kind fields (plain -> to, probability -> onSuccess/onFailure,
// conditional -> condition) are hard to express as schema-level required, so they are
// checked dynamically through a path-level validate() (which validateSync calls too).

import { Schema, model, models, Model } from "mongoose";
// The single source of the ending list (#352). A relative path, for jiti script compatibility.
import { ENDING_IDS } from '../types/web-adventure';

// -- a Choice's condition (used only on the conditional kind) --------------
const ChoiceConditionSchema = new Schema(
  {
    kind: { type: String, enum: ["minStat", "hasItem", "flag", "minFlag", "ability", "stigmaAtLeast", "stigmaAtMost", "all"], required: true },
    stat: { type: String },
    min: { type: Number },
    // #99's stigmaAtMost ceiling.
    max: { type: Number },
    itemId: { type: String },
    key: { type: String },
    // Week 5 (#221) - the flag condition's *inverted match* (with expect=false it is met when the flag is unset).
    // Undefined it defaults to true (preserving the previous behaviour). No default is stated, so mongoose does not
    // fill in false automatically.
    expect: { type: Boolean },
  },
  { _id: false },
);

// ── Choice ──────────────────────────────────────────────────────────────────
// The matrix of required fields per kind:
//   plain        → to
//   probability  → stat, difficulty, onSuccess, onFailure
//   conditional  → condition, to
//
// pre('validate') does not run under validateSync(), so it is implemented as a path-level
// .validate() (a validator returning false or throwing registers the error).
const ChoiceSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ["plain", "probability", "conditional"],
      required: true,
    },
    id: { type: String, required: true },
    label: { type: String, required: true },

    // plain | conditional
    to: { type: String },

    // probability
    stat: { type: String },
    difficulty: { type: Number },
    onSuccess: { type: String },
    onFailure: { type: String },

    // #89 - the trace of picking this choice (telling apart branches whose destination scene is the same).
    setFlags: { type: Map, of: Boolean },
    // conditional
    condition: { type: ChoiceConditionSchema },
    // Week 4 - the conditional's *fully hidden* mode (not rendered in the UI when the condition is unmet).
    hidden: { type: Boolean },
    // Week 5 (#221) - the probability's *one-off automatic hidden* (not rendered in the UI when that flag is truthy).
    hideWhenFlag: { type: String },
  },
  { _id: false },
);

// A function checking *the whole choice* is hung on the kind path's validator.
// (In a mongoose validator function, this = the sub-document.)
ChoiceSchema.path("kind").validate(function (kind: string) {
  // this is the choice sub-document.
  const self = this as unknown as Record<string, unknown>;
  if (kind === "plain") {
    if (!self.to) return false;
  } else if (kind === "probability") {
    if (!self.stat) return false;
    if (self.difficulty === undefined || self.difficulty === null) return false;
    if (!self.onSuccess) return false;
    if (!self.onFailure) return false;
  } else if (kind === "conditional") {
    if (!self.condition) return false;
    if (!self.to) return false;
  }
  return true;
}, "Choice 의 kind 별 필수 필드가 누락되었습니다.");

// ── position (#222) ─────────────────────────────────────────────────────────
// The ReactFlow node coordinates on /scenes/graph. Optional - dagre lays it out when unset.
const PositionSchema = new Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  { _id: false },
);

// ── onEnter ────────────────────────────────────────────────────────────────
const OnEnterSchema = new Schema(
  {
    setFlags: { type: Map, of: Boolean },
    // The default is stated as explicitly undefined - stopping mongoose from giving an array type
    // an empty array automatically (for an idempotent migration).
    addItems: { type: [String], default: undefined },
    // Week 4 - cumulative counters (caughtCount, for example) incremented by 1.
    incrementCounters: { type: [String], default: undefined },
    // The dynamic text variables (the source for {{key}} substitution) - merged into character.variables. The values are string|number.
    setVars: { type: Map, of: Schema.Types.Mixed },
  },
  { _id: false },
);

// -- bgm (the scene's default background music) -----------------------------
// Mirroring SceneBgm in types/web-adventure.ts 1:1. Mid-scene control is the body's <<bgm …>> directive.
const SceneBgmSchema = new Schema(
  {
    src: { type: String, required: true },
    loop: { type: Boolean },
    volume: { type: Number },
  },
  { _id: false },
);

// -- the Scene itself -------------------------------------------------------
// mongoose gives an array type a default of [], so required alone cannot catch a missing body;
// a validator forces it to be *non-empty* as well.
const WebAdventureSceneSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    illustration: { type: String, required: true },
    // The array of variation images. Chosen deterministically from (run + scene) on entry. Empty, it falls back to illustration.
    illustrations: { type: [String], default: [] },
    body: {
      type: [String],
      required: true,
      validate: {
        validator: (v: unknown) => Array.isArray(v) && v.length > 0,
        message: "body 는 비어있지 않은 배열이어야 합니다.",
      },
    },
    // #73's prose variants - treatment is the event's skeleton (the canonical text for writing), variants the per-style bodies.
    //   treatment **never goes on screen** (with no variant it falls back to body).
    //   variants is a free-keyed { [voice]: string[] } and so is Mixed - adding a style needs no schema change.
    treatment: { type: [String], default: [] },
    variants: { type: Schema.Types.Mixed, default: {} },
    choices: { type: [ChoiceSchema], required: true, default: [] },
    onEnter: { type: OnEnterSchema },
    // The scene's default BGM on entry (optional). Mid-scene control is the body's <<bgm …>> directive.
    bgm: { type: SceneBgmSchema },
    isEnding: { type: Boolean },
    endingId: {
      type: String,
      enum: [...ENDING_IDS], // #352 단일 출처
    },
    // #222 - the /scenes/graph node's coordinates (updated by the user's drag). Optional.
    position: { type: PositionSchema },
    // The old quest CMS pattern - the Scene's *current revision number*. +1 on every PUT.
    // Existing scenes are left undefined - the first PUT gives default 0 plus $inc 1 = 1.
    revisionCount: { type: Number, default: 0 },
    // Soft delete - deleting does not remove the document (preserving the revision history). id being unique, recreating with the same
    // id reuses (undeletes) the soft-deleted document. The game and listing queries use { $ne: true }.
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// -- the DTO interfaces -----------------------------------------------------
export interface WebAdventureSceneDoc {
  _id: unknown;
  id: string;
  title: string;
  illustration: string;
  illustrations?: string[];
  body: string[];
  /** #73's event skeleton (for writing). It never goes on screen. */
  treatment?: string[];
  /** #73's per-style bodies, { [voice]: string[] }. Absent, it falls back to body. */
  variants?: Record<string, string[]>;
  choices: Array<Record<string, unknown>>;
  onEnter?: {
    setFlags?: Map<string, boolean>;
    addItems?: string[];
    incrementCounters?: string[];
    setVars?: Map<string, string | number>;
  };
  /** The scene's default BGM on entry (optional). Mirrors SceneBgm in types/web-adventure.ts. */
  bgm?: { src: string; loop?: boolean; volume?: number };
  isEnding?: boolean;
  endingId?: string;
  /** #222 - the /scenes/graph node's coordinates. Optional. */
  position?: { x: number; y: number };
  /** The old quest CMS pattern - the current revision number. +1 on every PUT. */
  revisionCount?: number;
  /** Soft delete - true excludes it from the game and the listings (the document is kept). */
  isDeleted?: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const WebAdventureScene: Model<WebAdventureSceneDoc> =
  (models.WebAdventureScene as Model<WebAdventureSceneDoc> | undefined) ??
  model<WebAdventureSceneDoc>("WebAdventureScene", WebAdventureSceneSchema);

export default WebAdventureScene;
