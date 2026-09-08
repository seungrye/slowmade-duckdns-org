// WebAdventureSceneRevision - a snapshot of the *previous state* backed up on every scene PUT.
//
// It borrows the old post-revision pattern as it is:
//   - version increases sequentially from 1 per sceneId.
//   - different sceneIds have independent sequences.
//   - snapshot is Schema.Types.Mixed (the whole scene, free-form - onEnter, choices, illustration and so on).
//   - the PUT handler backs up the *current* scene, then overwrites it with the new data.
//   - a restore does the same - the current one is backed up as a revision, then the snapshot is restored.

import { InferSchemaType, Model, Schema, model, models } from 'mongoose';

const WebAdventureSceneRevisionSchema = new Schema(
  {
    // mongo's *business id* (kael_infirmary, for example). Not the _id.
    sceneId: { type: String, required: true, index: true },
    // The whole scene's snapshot - not strict (so it survives the scene schema evolving).
    snapshot: { type: Schema.Types.Mixed, required: true },
    // Increasing independently per sceneId, from 1.
    version: { type: Number, required: true },
    // The current session's email, or system.
    author: { type: String, default: 'system' },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'webadventurescenerevisions' },
);

// The compound index - for an efficient version DESC listing per sceneId.
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
