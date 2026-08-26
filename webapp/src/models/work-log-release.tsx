// work_log 앱 릴리스 (#261).
//
// APK 파일 자체는 MinIO 에 있고 여기엔 위치(objectKey)와 버전만 둔다.
// **한 벌만 보관한다** — 최신 하나면 앱이 업데이트를 받는 데 충분하고, 과거 버전을
// 되돌릴 일은 GitHub 릴리스에 남아 있다.

import { Schema, model, models, Model } from "mongoose";

export interface WorkLogReleaseDoc {
  /** 앱이 "새 버전인가"를 이 숫자로만 판단한다. 이름 비교는 어긋날 여지가 있다. */
  versionCode: number;
  /** 사람에게 보여 줄 이름 (0.2). */
  versionName: string;
  /** 무엇이 바뀌었는지 — 알림에 한두 줄 보여 준다. */
  notes: string;
  /** MinIO 안의 위치. 공개 URL 은 만들지 않는다 — 내려주기는 라우트가 한다. */
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
