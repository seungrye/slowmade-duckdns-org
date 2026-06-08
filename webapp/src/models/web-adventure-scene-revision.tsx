// WebAdventureSceneRevision — 씬 PUT 마다 *이전 상태* snapshot 백업.
//
// 옛 post-revision 패턴을 그대로 차용:
//   - sceneId 별 version 1 부터 sequential 증가.
//   - 다른 sceneId 끼리는 독립 sequence.
//   - snapshot 은 Schema.Types.Mixed (씬 전체 자유 구조 — onEnter / choices / illustration 등).
//   - PUT 핸들러가 *현재* 씬을 백업한 뒤 새 데이터로 덮어쓴다.
//   - restore 호출 시에도 동일 로직 — 현재 → revision 백업 후 snapshot 복원.

import { InferSchemaType, Model, Schema, model, models } from 'mongoose';

const WebAdventureSceneRevisionSchema = new Schema(
  {
    // mongo 의 *비즈니스 id* (예: kael_infirmary). _id 아님.
    sceneId: { type: String, required: true, index: true },
    // 씬 전체 snapshot — strict 미적용 (씬 스키마가 진화해도 보존 가능).
    snapshot: { type: Schema.Types.Mixed, required: true },
    // 1 부터 sceneId 별 독립 증가.
    version: { type: Number, required: true },
    // 현 세션 email 또는 system.
    author: { type: String, default: 'system' },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'webadventurescenerevisions' },
);

// 복합 인덱스 — sceneId 별 version DESC 목록 query 효율.
WebAdventureSceneRevisionSchema.index({ sceneId: 1, version: -1 });

export type WebAdventureSceneRevisionType = InferSchemaType<
  typeof WebAdventureSceneRevisionSchema
>;

export interface WebAdventureSceneRevisionDoc {
  _id: unknown;
  sceneId: string;
  snapshot: unknown;
  version: number;
  author: string;
  createdAt: Date;
}

const WebAdventureSceneRevision: Model<WebAdventureSceneRevisionDoc> =
  (models.WebAdventureSceneRevision as Model<WebAdventureSceneRevisionDoc> | undefined) ??
  model<WebAdventureSceneRevisionDoc>(
    'WebAdventureSceneRevision',
    WebAdventureSceneRevisionSchema,
  );

export default WebAdventureSceneRevision;
