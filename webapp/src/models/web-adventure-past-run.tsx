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
    // #287 〈에테르니아〉 — 주인공 정체성 + 침식. snapshot 보존.
    protagonist: { type: String, required: true }, // kael | rin | solwen
    stigmaErosion: { type: Number, required: true, min: 0, max: 100 },
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
    // 시작 → 종료까지 거쳐간 씬 id 시퀀스 (경로 분포 통계용). 기존 데이터엔 없음.
    scenePath: { type: [String], default: [] },
    // #9 — 엔딩 시점의 풍부한 서사 로그(선택·본문·판정 텍스트). 피드백 노트 LLM 입력용.
    //   클라이언트 GameState.log 를 그대로 저장. 기존 데이터엔 없음.
    log: { type: [String], default: [] },
    character: { type: CharacterSchema, required: true },
    // #63 — 클라이언트가 회차마다 만드는 고유 id. 앱 재시도 큐(#61)가 같은 회차를 다시
    //   보내도 한 번만 저장하기 위한 멱등 키. 웹/기존 데이터엔 없으므로 기본 빈 문자열.
    clientRunId: { type: String, default: '' },
    completedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

// 한 사용자의 같은 runIndex 가 중복 적치되지 않도록 unique 복합 인덱스.
WebAdventurePastRunSchema.index({ userEmail: 1, runIndex: 1 }, { unique: true });

// 멱등 키 — 값이 있는 문서끼리만 unique. 기존 문서·웹 회차는 빈 문자열이라 제외된다
// (partial 이 아니면 빈 문자열이 서로 충돌해 두 번째 회차부터 저장이 막힌다).
WebAdventurePastRunSchema.index(
  { userEmail: 1, clientRunId: 1 },
  { unique: true, partialFilterExpression: { clientRunId: { $gt: '' } } },
);

export interface WebAdventurePastRunDoc {
  _id: unknown;
  userEmail: string;
  runIndex: number;
  endingId: 'ascension' | 'revolution' | 'harmony' | 'fall' | 'petrification' | 'sylvan_bond';
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
