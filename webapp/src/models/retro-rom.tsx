// RetroRom — 사용자가 올린 롬 파일 메타 (#109).
//
// 파일 자체는 MinIO 에 있고 여기엔 위치(objectKey)와 표시 정보만 둔다.
// **올린 사람만 보고 실행할 수 있다** — 목록·다운로드·삭제 전부 userEmail 로 좁힌다.
// 남의 롬이 주소만으로 새 나가면 저작권 문제가 되므로 공개 URL 은 만들지 않는다.

import { Schema, model, models, Model, Types } from "mongoose";

export interface RetroRomDoc {
  _id: Types.ObjectId;
  /** 소유자 — 이 값으로 모든 조회를 좁힌다. */
  userEmail: string;
  title: string;
  /** PlatformId (`src/lib/retro/platforms.ts`). 문자열로 두어 기종 추가 시 마이그레이션이 없다. */
  platform: string;
  /** EmulatorJS 코어명 — 업로드 시점 기종에서 확정해 굳혀 둔다. */
  core: string;
  /** 올릴 때의 원본 파일명(표시·다운로드용). */
  filename: string;
  size: number;
  /** MinIO 오브젝트 키. */
  objectKey: string;
  isDeleted?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RetroRomSchema = new Schema<RetroRomDoc>(
  {
    userEmail: { type: String, required: true, index: true },
    title: { type: String, required: true },
    platform: { type: String, required: true },
    core: { type: String, required: true },
    filename: { type: String, required: true },
    size: { type: Number, required: true },
    objectKey: { type: String, required: true },
    // 삭제는 항상 soft — 실수로 지운 롬을 되살릴 수 있어야 한다. MinIO 오브젝트도 남긴다.
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// 목록 질의(내 롬, 안 지운 것, 최신순) 한 방에 타는 복합 인덱스.
RetroRomSchema.index({ userEmail: 1, isDeleted: 1, createdAt: -1 });

const RetroRom = (models.RetroRom as Model<RetroRomDoc>) || model<RetroRomDoc>("RetroRom", RetroRomSchema);

export default RetroRom;
