// WebAdventureSceneImage - the queue that makes one more scene illustration per ending (#158).
//
// Each time a run ends, one scene is picked at random, an image is generated and added to that scene's
// `illustrations[]`. The rendering needs nothing - the structure that deterministically picks a variation from (run + scene)
// on entering a scene is already there, so the longer the array, the more faces the same scene wears across runs.
//
// The same durable-queue shape as the feedback notes (#9):
//   queued → processing → ready | failed
// The worker atomically claims the oldest queued and handles them one at a time, and a processing cut off by
// a restart is returned to queued once claimedAt is old enough.
//
// **There is no author approval step** (it applies at once). Instead which run produced an image is recorded, so an image
// that is not liked can be picked out and deleted later.

import { Schema, model, models, Model, Types } from 'mongoose';

const WebAdventureSceneImageSchema = new Schema(
  {
    // The scene to add the image to (WebAdventureScene.id - a string id, not an ObjectId).
    sceneId: { type: String, required: true, index: true },
    // The origin: the run that produced this image. The clue when undoing it.
    pastRunId: { type: Schema.Types.ObjectId, ref: 'WebAdventurePastRun', default: null },
    sourceUserEmail: { type: String, default: '' },
    endingId: { type: String, default: '' },

    // The prompt used to generate it - kept so the cause can be seen when an image comes out in the wrong style.
    prompt: { type: String, default: '' },
    // The result.
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

// So the worker picks the oldest queued first.
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
