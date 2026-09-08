// WebAdventureFeedbackNote - the author's (owner's) feedback note, made by fleshing out a play run
// (a past-run) with the local LLM (#9).
//
// This document doubles as **the durable queue item**: status expresses the generation pipeline.
//   queued → processing → ready | failed
// The worker atomically claims the oldest status=queued (-> processing) and handles them one at a
// time, in order (the shim has a single slot, so parallelism is forbidden). A processing cut off by a server restart
// is returned to queued by the worker once claimedAt is old enough (preventing a loss).
//
// The result (narrative/authorNote) is kept as ready, and deletion is a soft delete (isDeleted).

import { Schema, model, models, Model, Types } from 'mongoose';

const WebAdventureFeedbackNoteSchema = new Schema(
  {
    // The owner who owns and reads the note (an owner-only feature, so in practice OWNER_EMAIL).
    ownerEmail: { type: String, required: true, index: true },
    // The reference to the source past-run plus the denormalised fields for display.
    pastRunId: { type: Schema.Types.ObjectId, ref: 'WebAdventurePastRun', required: true },
    sourceUserEmail: { type: String, required: true }, // 그 회차를 플레이한 사용자
    runIndex: { type: Number, required: true },
    endingId: { type: String, required: true },
    // #90 - that run's prose style (copied from pastRun). For display and tracing; it is not used in the generation prompt.
    voice: { type: String, default: '' },
    finalSceneId: { type: String, required: true },
    // The generated result (the LLM's original text is kept).
    title: { type: String, default: '' },
    narrative: { type: String, default: '' }, // 살 붙인 서사
    // The author's note = hints and suggestions for a new scenario. It is the only body field the generator fills in.
    // (#27's scenarioProposal was never once filled in by the generator and was removed. The one document that had a value
    //  was preserved by merging it into authorNote as a "scenario proposal (migrated)" section. #69)
    authorNote: { type: String, default: '' },
    // The queue and pipeline state.
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

// The sort index so the worker picks the oldest queued first.
WebAdventureFeedbackNoteSchema.index({ status: 1, createdAt: 1 });

export type FeedbackNoteStatus = 'queued' | 'processing' | 'ready' | 'failed';

export interface WebAdventureFeedbackNoteDoc {
  _id: Types.ObjectId;
  ownerEmail: string;
  pastRunId: Types.ObjectId;
  sourceUserEmail: string;
  runIndex: number;
  endingId: string;
  /** #90 - that run's prose style (copied from pastRun). For display and tracing. */
  voice?: string;
  finalSceneId: string;
  title: string;
  narrative: string;
  authorNote: string;
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
