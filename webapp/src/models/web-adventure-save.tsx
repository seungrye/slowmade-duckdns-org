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
    // #287 〈에테르니아〉 — 주인공 정체성 + 침식. strict mode 에서 schema 누락이면
    //   직렬화 시 *사라짐* → RESTORE 후 회차 정보 손실. 반드시 명시.
    protagonist: { type: String, required: true }, // kael | rin | solwen
    stigmaErosion: { type: Number, required: true, min: 0, max: 100 },
    inventory: { type: [String], required: true, default: [] },
    // flags: 임의 string key → boolean. Mongoose 의 Map<Boolean>.
    // #356 — Map 이 아니다. world.* 플래그의 키에 **점**이 들어 있는데 MongoDB 는 Map
    //   키에 점을 못 쓴다. 그 탓에 두 번째 회차부터 문서 전체가 저장되지 않았다.
    //   코드는 어디서도 Map 으로 안 쓴다 — 늘 character.flags[key] 로 읽는다.
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
