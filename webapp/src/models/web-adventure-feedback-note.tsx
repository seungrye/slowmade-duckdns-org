// WebAdventureFeedbackNote — 플레이 회차(past-run)를 로컬 LLM으로 살 붙여 만든
// 작가(owner) 전용 피드백 노트 (#9).
//
// 이 문서가 **내구 큐 아이템**을 겸한다: status 로 생성 파이프라인을 표현한다.
//   queued → processing → ready | failed
// 워커가 status=queued 중 가장 오래된 것을 원자적으로 claim(→processing)해 한 개씩
// 순차 처리한다(shim 이 단일 슬롯이라 병렬 금지). 서버 재시작으로 끊긴 processing 은
// claimedAt 이 오래되면 워커가 queued 로 되돌린다(유실 방지).
//
// 결과(narrative/authorNote)는 ready 로 보존, 삭제는 soft-delete(isDeleted).

import { Schema, model, models, Model, Types } from 'mongoose';

const WebAdventureFeedbackNoteSchema = new Schema(
  {
    // 노트를 소유/열람하는 owner (owner 전용 기능이라 사실상 OWNER_EMAIL).
    ownerEmail: { type: String, required: true, index: true },
    // 입력 원천 past-run 참조 + 표시용 비정규화 필드.
    pastRunId: { type: Schema.Types.ObjectId, ref: 'WebAdventurePastRun', required: true },
    sourceUserEmail: { type: String, required: true }, // 그 회차를 플레이한 사용자
    runIndex: { type: Number, required: true },
    endingId: { type: String, required: true },
    finalSceneId: { type: String, required: true },
    // 생성 결과 (LLM 원문 유지).
    title: { type: String, default: '' },
    narrative: { type: String, default: '' }, // 살 붙인 서사
    authorNote: { type: String, default: '' }, // 작가 노트 = 신규 시나리오 힌트/제안
    // #27 — 작가 노트를 근거로 생성한 시나리오 개선안(신규 씬 초안 + 기존 씬 보완 제안).
    //   비파괴 검토용 — 씬 CMS 를 직접 건드리지 않고 노트에 문서로 붙인다(마크다운).
    scenarioProposal: { type: String, default: '' },
    // 큐/파이프라인 상태.
    status: {
      type: String,
      required: true,
      enum: ['queued', 'processing', 'ready', 'failed'],
      default: 'queued',
      index: true,
    },
    claimedAt: { type: Date, default: null }, // processing 진입 시각 (stale 복구 판정).
    attempts: { type: Number, required: true, default: 0 },
    error: { type: String, default: '' },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// 워커가 오래된 queued 를 먼저 집도록 정렬 인덱스.
WebAdventureFeedbackNoteSchema.index({ status: 1, createdAt: 1 });

export type FeedbackNoteStatus = 'queued' | 'processing' | 'ready' | 'failed';

export interface WebAdventureFeedbackNoteDoc {
  _id: Types.ObjectId;
  ownerEmail: string;
  pastRunId: Types.ObjectId;
  sourceUserEmail: string;
  runIndex: number;
  endingId: string;
  finalSceneId: string;
  title: string;
  narrative: string;
  authorNote: string;
  scenarioProposal: string;
  status: FeedbackNoteStatus;
  claimedAt: Date | null;
  attempts: number;
  error: string;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const WebAdventureFeedbackNote: Model<WebAdventureFeedbackNoteDoc> =
  (models.WebAdventureFeedbackNote as Model<WebAdventureFeedbackNoteDoc> | undefined) ??
  model<WebAdventureFeedbackNoteDoc>('WebAdventureFeedbackNote', WebAdventureFeedbackNoteSchema);

export default WebAdventureFeedbackNote;
