// WebAdventurePastRun — 한 회차가 엔딩으로 종결됐을 때 적치되는 기록 (#239).
//
// save 의 진행 중 회차가 엔딩 도달 시 이 컬렉션으로 이전 + save 의 runIndex+1
// 로 재생성된다 (회차 시스템). 갤러리/통계에 사용.

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
    inventory: { type: [String], required: true, default: [] },
    flags: { type: Map, of: Boolean, default: {} },
    rerollsLeft: { type: Number, required: true },
  },
  { _id: false },
);

const WebAdventurePastRunSchema = new Schema(
  {
    userEmail: { type: String, required: true, index: true },
    runIndex: { type: Number, required: true, min: 1 },
    endingId: {
      type: String,
      required: true,
      enum: ['ascension', 'revolution', 'harmony', 'fall', 'petrification', 'sylvan_bond'],
    },
    finalSceneId: { type: String, required: true },
    character: { type: CharacterSchema, required: true },
    completedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

// 한 사용자의 같은 runIndex 가 중복 적치되지 않도록 unique 복합 인덱스.
WebAdventurePastRunSchema.index({ userEmail: 1, runIndex: 1 }, { unique: true });

export interface WebAdventurePastRunDoc {
  _id: unknown;
  userEmail: string;
  runIndex: number;
  endingId: 'ascension' | 'revolution' | 'harmony' | 'fall' | 'petrification' | 'sylvan_bond';
  finalSceneId: string;
  character: {
    stats: { str: number; dex: number; int: number; cha: number; con: number; wis: number };
    hp: number;
    maxHp: number;
    ability: string;
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
