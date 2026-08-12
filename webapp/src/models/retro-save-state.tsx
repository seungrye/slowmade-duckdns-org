// RetroSaveState — 서버에 두는 세이브스테이트 (#114).
//
// 브라우저(IndexedDB) 대신 계정에 붙인다. 브라우저를 바꿔도, 폰에서 저장하고 PC 에서 이어
// 해도 남아 있다.
//
// **게임당 슬롯 하나.** EmulatorJS 의 네이티브 「Load State」 버튼이 인자를 받지 않아서,
// 여러 슬롯을 두면 iframe 안에 우리 UI 를 새로 그려야 한다 — 네이티브 UI 를 그대로 쓰는
// 이 설계의 이점을 스스로 버리는 셈이다. 저장하면 이전 것을 덮어쓴다.
//
// **여기만 soft delete 가 아니다.** 세이브는 덮어쓰는 것이 본질이고, 플래그만 세우면 같은
// (user, game) 로 다시 저장할 때 아래 유니크 인덱스와 부딪힌다. 대신 MinIO 오브젝트는 남긴다.

import { Schema, model, models, Model, Types } from "mongoose";

export interface RetroSaveStateDoc {
  _id: Types.ObjectId;
  userEmail: string;
  /** `builtin:<slug>` 또는 `rom:<id>` — `lib/retro/game-key.ts` 가 만들고 검증한다. */
  gameKey: string;
  size: number;
  objectKey: string;
  /** 저장 순간의 화면. EmulatorJS 가 saveState 이벤트에 함께 실어 준다. */
  shotKey?: string;
  shotFormat?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RetroSaveStateSchema = new Schema<RetroSaveStateDoc>(
  {
    userEmail: { type: String, required: true },
    gameKey: { type: String, required: true },
    size: { type: Number, required: true },
    objectKey: { type: String, required: true },
    shotKey: { type: String },
    shotFormat: { type: String },
  },
  { timestamps: true },
);

// 게임당 하나 — 저장은 이 인덱스 위에서 업서트로 이뤄진다.
RetroSaveStateSchema.index({ userEmail: 1, gameKey: 1 }, { unique: true });

const RetroSaveState =
  (models.RetroSaveState as Model<RetroSaveStateDoc>) ||
  model<RetroSaveStateDoc>("RetroSaveState", RetroSaveStateSchema);

export default RetroSaveState;
