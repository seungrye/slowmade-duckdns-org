// WebAdventureSceneImage — 엔딩마다 씬 삽화를 한 장 더 만드는 큐 (#158).
//
// 회차를 끝낼 때마다 씬 하나를 무작위로 골라 그림을 생성하고, 그 씬의 `illustrations[]` 에
// 더한다. 렌더링은 손댈 것이 없다 — 씬 진입 때 (회차+씬)으로 배리에이션을 결정적 선택하는
// 구조가 이미 있어서, 배열이 길어질수록 같은 씬이 회차마다 다른 얼굴로 보인다.
//
// 피드백 노트(#9)와 같은 내구 큐 모양이다:
//   queued → processing → ready | failed
// 워커가 가장 오래된 queued 를 원자적으로 claim 해 한 개씩 처리하고, 재시작으로 끊긴
// processing 은 claimedAt 이 오래되면 queued 로 되돌린다.
//
// **작가 승인 단계는 없다**(바로 반영). 대신 어느 회차가 만든 그림인지 남겨, 마음에 안 드는
// 그림을 나중에 골라 지울 수 있게 한다.

import { Schema, model, models, Model, Types } from 'mongoose';

const WebAdventureSceneImageSchema = new Schema(
  {
    // 그림을 더할 씬 (WebAdventureScene.id — ObjectId 가 아니라 문자열 id).
    sceneId: { type: String, required: true, index: true },
    // 출처: 이 그림을 낳은 회차. 되돌릴 때의 단서다.
    pastRunId: { type: Schema.Types.ObjectId, ref: 'WebAdventurePastRun', default: null },
    sourceUserEmail: { type: String, default: '' },
    endingId: { type: String, default: '' },

    // 생성에 쓴 프롬프트 — 화풍이 어긋난 그림이 나왔을 때 원인을 볼 수 있게 남긴다.
    prompt: { type: String, default: '' },
    // 결과.
    url: { type: String, default: '' },
    objectKey: { type: String, default: '' },

    status: {
      type: String,
      required: true,
      enum: ['queued', 'processing', 'ready', 'failed'],
      default: 'queued',
      index: true,
    },
    claimedAt: { type: Date, default: null },
    attempts: { type: Number, required: true, default: 0 },
    error: { type: String, default: '' },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// 워커가 오래된 queued 를 먼저 집도록.
WebAdventureSceneImageSchema.index({ status: 1, createdAt: 1 });

export type SceneImageStatus = 'queued' | 'processing' | 'ready' | 'failed';

export interface WebAdventureSceneImageDoc {
  _id: Types.ObjectId;
  sceneId: string;
  pastRunId: Types.ObjectId | null;
  sourceUserEmail: string;
  endingId: string;
  prompt: string;
  url: string;
  objectKey: string;
  status: SceneImageStatus;
  claimedAt: Date | null;
  attempts: number;
  error: string;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const WebAdventureSceneImage =
  (models.WebAdventureSceneImage as Model<WebAdventureSceneImageDoc>) ||
  model<WebAdventureSceneImageDoc>('WebAdventureSceneImage', WebAdventureSceneImageSchema);

export default WebAdventureSceneImage;
