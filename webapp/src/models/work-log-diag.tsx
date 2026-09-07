// work_log 진단 자취 (#409).
//
// **여러 벌 보관한다.** 릴리스는 최신 하나면 앱이 업데이트를 받는 데 충분하지만,
// 크래시는 **되풀이되는 것 자체가 단서**다 — 같은 자리에서 세 번 죽었다는 사실이
// 한 번 죽은 것보다 훨씬 많은 것을 말해 준다.
//
// 그래도 무한정 쌓지는 않는다. 최근 스무 벌이면 흐름을 보기에 넉넉하다.

import { Schema, model, models, Model } from "mongoose";

export interface WorkLogDiagDoc {
  /** 어느 판에서 났나. 고친 판에서도 나는지 가르는 값이라 중요하다. */
  versionCode: number;
  versionName: string;
  /** 어느 기기인가 — 기기를 타는 문제인지 가른다. */
  device: string;
  /** 왜 올렸나 (crash · anr · manual). 목록에서 훑을 때 쓴다. */
  kind: string;
  /** 자취 본문. 글자라 그대로 담는다. */
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
