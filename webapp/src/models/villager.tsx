import { Schema, model, models, Model } from "mongoose";
import type { ZoneIdValue } from "@/types/zone";

// villager 의 `homeZone` 미들태그(`{ type: "Town" }`) 를 보관하는 sub-schema.
// _id: false — sub-document 의 자동 _id 를 만들지 않는다(zone tag 는 식별자 아님).
//
// validate: ZoneIdValue 의 변형 화이트리스트. 게임 측 ZoneId enum 과 동기화.
const ZoneIdSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["Town", "MountainVillage", "SeasideHarbor", "Forest", "Dungeon", "Named"],
    },
    // Dungeon(N) 의 N — type === "Dungeon" 일 때만 의미가 있다.
    level: { type: Number, default: undefined },
    // Named("…") 의 식별자 — type === "Named" 일 때만 의미가 있다.
    id: { type: String, default: undefined },
  },
  { _id: false },
);

const VillagerSchema = new Schema(
  {
    // 정체성 키 — 퀘스트 giver_npc / KillNpc 가 참조. name 은 표시용(unique X).
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    color: {
      type: [Number],
      required: true,
      validate: {
        validator: (v: number[]) => v.length === 3 && v.every((n) => n >= 0 && n <= 1),
        message: "color 는 [r, g, b] (각 0.0~1.0) 형식이어야 합니다.",
      },
    },
    dialogs: { type: [String], default: [] },
    speed: { type: Number, default: 1.0 },
    // 게임 RON 의 stationary/vendor 미러 — #[serde(default)] 이므로 기본 false.
    stationary: { type: Boolean, default: false },
    vendor: { type: Boolean, default: false },
    // 게임 RON 의 home_zone 미러 — #[serde(default = "Town")] 와 동일한 기본값.
    // 분산 미설정 시 시작 마을(Town) 에 자동 배치된다(기존 동작 유지).
    homeZone: { type: ZoneIdSchema, default: () => ({ type: "Town" }) },
    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export interface VillagerDoc {
  _id: unknown;
  id: string;
  name: string;
  color: number[];
  dialogs: string[];
  speed: number;
  stationary: boolean;
  vendor: boolean;
  homeZone: ZoneIdValue;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const Villager: Model<VillagerDoc> =
  models.Villager || model<VillagerDoc>("Villager", VillagerSchema);

export default Villager;
