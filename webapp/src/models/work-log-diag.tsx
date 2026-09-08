// work_log's diagnostic traces (#409).
//
// **Several are kept.** For releases the latest alone is enough for the app to get an update, but
// with crashes **the recurrence is itself the clue** - that it died three times in the same place says
// far more than dying once.
//
// Even so they do not pile up without limit. The most recent twenty are plenty to see the pattern.

import { Schema, model, models, Model } from "mongoose";

export interface WorkLogDiagDoc {
  /** Which build it happened on. It decides whether the fixed build still shows it, so it matters. */
  versionCode: number;
  versionName: string;
  /** Which device - telling whether the problem is device-specific. */
  device: string;
  /** Why it was uploaded (crash, anr or manual). Used when scanning the list. */
  kind: string;
  /** The trace itself. Being text, it is stored as it is. */
  body: string;
  createdAt: Date;
}

const WorkLogDiagSchema = new Schema<WorkLogDiagDoc>(
  {
    versionCode: { type: Number, default: 0, index: true },
    versionName: { type: String, default: "" },
    device: { type: String, default: "" },
    kind: { type: String, default: "unknown", index: true },
    body: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

const WorkLogDiag: Model<WorkLogDiagDoc> =
  (models.WorkLogDiag as Model<WorkLogDiagDoc>) ||
  model<WorkLogDiagDoc>("WorkLogDiag", WorkLogDiagSchema);

export default WorkLogDiag;
