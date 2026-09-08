// The work_log app's releases (#261).
//
// The APK file itself lives in MinIO; this holds only its location (objectKey) and the version.
// **Only one is kept** - the latest alone is enough for the app to get an update, and reverting to an older
// version is what the GitHub releases are for.

import { Schema, model, models, Model } from "mongoose";

export interface WorkLogReleaseDoc {
  /** The app judges "is this newer" from this number alone. Comparing names leaves room for drift. */
  versionCode: number;
  /** The name to show people (0.2). */
  versionName: string;
  /** What changed - a line or two shown in the notice. */
  notes: string;
  /** The location inside MinIO. No public URL is made - the route serves it. */
  objectKey: string;
  size: number;
  createdAt: Date;
}

const WorkLogReleaseSchema = new Schema<WorkLogReleaseDoc>(
  {
    versionCode: { type: Number, required: true, index: true },
    versionName: { type: String, required: true },
    notes: { type: String, default: "" },
    objectKey: { type: String, required: true },
    size: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

const WorkLogRelease: Model<WorkLogReleaseDoc> =
  (models.WorkLogRelease as Model<WorkLogReleaseDoc>) ||
  model<WorkLogReleaseDoc>("WorkLogRelease", WorkLogReleaseSchema);

export default WorkLogRelease;
