// WebAdventureSave — Web Adventure CYOA 의 *현재 진행 중* 회차 저장 (#237).
//
// 5주차 milestone — 자동 저장 (디바운스 1초) + 로그인/비로그인 통합.
// 한 사용자(userEmail) 당 1 save. 엔딩 도달 시 past run 으로 이전 + save 초기화
// (회차 시스템은 #239 에서 구현).

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
    // flags: 임의 string key → boolean. Mongoose 의 Map<Boolean>.
    flags: { type: Map, of: Boolean, default: {} },
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
