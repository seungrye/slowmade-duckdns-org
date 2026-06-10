// WebAdventureScene — Web MUD CYOA 씬 mongo 모델.
//
// Phase B (#212): 18 정적 ts 씬을 mongo 로 100% 이전.
// 클라이언트는 `/api/web-adventure/content/v1` 엔드포인트로 캐시 가능한
// 전체 씬 컨텐츠를 fetch (Phase C 에서 도입).
//
// 스키마는 src/types/web-adventure.ts 의 Scene 타입을 1:1 미러링.
// Choice 의 kind 별 필드 (plain → to, probability → onSuccess/onFailure,
// conditional → condition) 는 schema-level required 가 표현하기 어려우므로
// path-level validate() 로 동적 검증한다 (validateSync 에서도 호출됨).

import { Schema, model, models, Model } from "mongoose";

// ── Choice 의 condition (conditional 종류일 때만 사용) ─────────────────────
const ChoiceConditionSchema = new Schema(
  {
    kind: { type: String, enum: ["minStat", "hasItem", "flag", "minFlag"], required: true },
    stat: { type: String },
    min: { type: Number },
    itemId: { type: String },
    key: { type: String },
    // 5 주차 (#221) — flag 조건의 *반전 매치* (expect=false 시 flag 미설정일 때 충족).
    // 미정의 시 default true (기존 동작 보존). mongoose 가 자동으로 false 를 채워넣지 않도록
    // default 를 명시하지 않는다.
    expect: { type: Boolean },
  },
  { _id: false },
);

// ── Choice ──────────────────────────────────────────────────────────────────
// kind 별 필수 필드 매트릭스:
//   plain        → to
//   probability  → stat, difficulty, onSuccess, onFailure
//   conditional  → condition, to
//
// pre('validate') 는 validateSync() 에서 동작하지 않으므로 path-level
// .validate() 로 구현 (validator 가 false 반환 또는 throw 시 에러 등록).
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

    // conditional
    condition: { type: ChoiceConditionSchema },
    // 4 주차 — conditional 의 *완전 숨김* 모드 (조건 미충족 시 UI 에서 렌더 X).
    hidden: { type: Boolean },
    // 5 주차 (#221) — probability 의 *일회성 자동 hidden* (해당 flag truthy 면 UI 에서 렌더 X).
    hideWhenFlag: { type: String },
  },
  { _id: false },
);

// kind path 의 validator 에 *전체 choice* 를 점검하는 함수를 매단다.
// (mongoose 는 validator 함수에서 this = sub-document.)
ChoiceSchema.path("kind").validate(function (kind: string) {
  // this 는 choice sub-document.
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
// /scenes/graph 의 ReactFlow 노드 좌표. optional — 미설정 시 dagre 자동.
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
    // default 를 명시적으로 undefined 로 — mongoose 가 array 타입에 자동으로
    // 빈 배열을 부여하지 않도록 막는다 (idempotent migration 위함).
    addItems: { type: [String], default: undefined },
    // 4 주차 — 누적 카운터 (예: caughtCount) +1 씩 누적.
    incrementCounters: { type: [String], default: undefined },
  },
  { _id: false },
);

// ── Scene 본체 ──────────────────────────────────────────────────────────────
// body 는 mongoose 가 array 타입을 default [] 로 처리해서 required 만으로는
// "누락" 을 잡지 못하므로 validator 로 *비어있지 않음* 까지 강제한다.
const WebAdventureSceneSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    illustration: { type: String, required: true },
    // 배리에이션 이미지 배열. 진입 시 (회차+씬) 결정적 선택. 비면 illustration fallback.
    illustrations: { type: [String], default: [] },
    body: {
      type: [String],
      required: true,
      validate: {
        validator: (v: unknown) => Array.isArray(v) && v.length > 0,
        message: "body 는 비어있지 않은 배열이어야 합니다.",
      },
    },
    choices: { type: [ChoiceSchema], required: true, default: [] },
    onEnter: { type: OnEnterSchema },
    isEnding: { type: Boolean },
    endingId: {
      type: String,
      enum: ["ascension", "revolution", "harmony", "fall", "petrification", "sylvan_bond"],
    },
    // #222 — /scenes/graph 노드 좌표 (사용자 드래그로 갱신). optional.
    position: { type: PositionSchema },
    // 옛 quest CMS 패턴 — Scene 의 *현재 리비전 번호*. PUT 마다 +1.
    // 기존 씬은 정의되지 않은 상태로 잔존 — 첫 PUT 시 default 0 + $inc 1 = 1.
    revisionCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// ── DTO 인터페이스 ─────────────────────────────────────────────────────────
export interface WebAdventureSceneDoc {
  _id: unknown;
  id: string;
  title: string;
  illustration: string;
  illustrations?: string[];
  body: string[];
  choices: Array<Record<string, unknown>>;
  onEnter?: {
    setFlags?: Map<string, boolean>;
    addItems?: string[];
    incrementCounters?: string[];
  };
  isEnding?: boolean;
  endingId?: string;
  /** #222 — /scenes/graph 노드 좌표. optional. */
  position?: { x: number; y: number };
  /** 옛 quest CMS 패턴 — 현재 리비전 번호. PUT 마다 +1. */
  revisionCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

const WebAdventureScene: Model<WebAdventureSceneDoc> =
  (models.WebAdventureScene as Model<WebAdventureSceneDoc> | undefined) ??
  model<WebAdventureSceneDoc>("WebAdventureScene", WebAdventureSceneSchema);

export default WebAdventureScene;
