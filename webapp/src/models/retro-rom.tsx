// RetroRom — 사용자가 올린 롬 파일 메타 (#109).
//
// 파일 자체는 MinIO 에 있고 여기엔 위치(objectKey)와 표시 정보만 둔다.
// **올린 사람만 보고 실행할 수 있다** — 목록·다운로드·삭제 전부 userEmail 로 좁힌다.
// 남의 롬이 주소만으로 새 나가면 저작권 문제가 되므로 공개 URL 은 만들지 않는다.

import { Schema, model, models, Model, Types } from "mongoose";

/**
 * 롬에 매다는 패치 (#112) — 한글 패치 등.
 *
 * 롬과 패치는 **따로** 보관하고 합친 결과는 저장하지 않는다. 합치기는 실행할 때 브라우저가
 * 한다(`public/games/retro/rom-patch.js`). 그래서 원본 하나에 패치를 갈아 끼울 수 있다.
 *
 * `Post.attachments`(`models/post.tsx`)와 같은 임베드 배열 방식이다.
 */
export interface RetroPatchDoc {
  _id: Types.ObjectId;
  /** 표시용 이름 — 확장자를 남겨 형식이 눈에 보이게 한다. */
  name: string;
  /** ips | bps | ups — 업로드 시점에 매직으로 판별해 굳혀 둔다. */
  format: string;
  size: number;
  objectKey: string;
  isDeleted?: boolean;
  createdAt: Date;
}

const RetroPatchSchema = new Schema<RetroPatchDoc>(
  {
    name: { type: String, required: true },
    format: { type: String, required: true },
    size: { type: Number, required: true },
    objectKey: { type: String, required: true },
    // 롬과 같은 원칙 — 배열에서 빼지 않고 플래그만 세운다.
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

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
  /** 이 롬에 매단 패치들 (#112). 실행할 때 하나를 골라 브라우저에서 합친다. */
  patches: RetroPatchDoc[];
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
    patches: { type: [RetroPatchSchema], default: [] },
    // 삭제는 항상 soft — 실수로 지운 롬을 되살릴 수 있어야 한다. MinIO 오브젝트도 남긴다.
    isDeleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// 목록 질의(내 롬, 안 지운 것, 최신순) 한 방에 타는 복합 인덱스.
RetroRomSchema.index({ userEmail: 1, isDeleted: 1, createdAt: -1 });

const RetroRom = (models.RetroRom as Model<RetroRomDoc>) || model<RetroRomDoc>("RetroRom", RetroRomSchema);

export default RetroRom;
