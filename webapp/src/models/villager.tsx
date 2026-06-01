import { Schema, model, models, Model } from "mongoose";
import type { ZoneIdValue } from "@/types/zone";
import { HOME_LANDMARKS, type HomeLandmark } from "@/types/villager";

// villager 의 `homeZone` 미들태그(`{ type: "Town" }` | `{ type: "Named", id: ... }`)
// 를 보관하는 sub-schema. _id: false — sub-document 의 자동 _id 를 만들지 않는다.
//
// validate: ZoneIdValue 의 변형 화이트리스트. 게임 측 `ZoneId` enum 과 동기화 —
// `Town` 만 정적, 나머지는 모두 `Named(id)` 로 표현된다(forest/dungeon_<N>/
// mountain_village/seaside_harbor 포함).
const ZoneIdSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ["Town", "Named"],
    },
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
    // 게임 RON 의 home_landmark 미러 — #[serde(default)] HomeLandmark::Random.
    // Town zone 안에서 villager 가 어디에 spawn 할지 지정. 6 landmark + Road + Random.
    // Town 이 아닌 zone 또는 해당 landmark 가 비활성(TownConfig.landmarks 미포함)일
    // 경우 게임 측에서 Random fallback 한다.
    homeLandmark: {
      type: String,
      enum: HOME_LANDMARKS,
      default: "random" satisfies HomeLandmark,
    },
    // 게임 RON 의 free_roam 미러 — #[serde(default)] free_roam: false.
    // false 면 거주 영역(landmark/명명 집/도로) 안만 이동. true 면 자유 이동.
    freeRoam: { type: Boolean, default: false },
    // 게임 RON 의 vendor_vision_radius 미러 — Option<u32> 의 직렬화.
    // null/undefined → 게임 측 fallback default (6 타일).
    // 정수 (>= 0) → 그 vendor 만 해당 반경 적용 (예: market_owner = 2).
    // vendor=false 인 NPC 에서는 무시된다 (오버레이는 vendor 만 그린다).
    vendorVisionRadius: { type: Number, default: null },
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
  homeLandmark: HomeLandmark;
  freeRoam: boolean;
  /**
   * vendor 의 시야 반경 — null 은 게임 측 default (6). vendor=false 면 무시.
   * 게임 측 `Option<u32>` 미러 (Schema default = null).
   */
  vendorVisionRadius: number | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const Villager: Model<VillagerDoc> =
  models.Villager || model<VillagerDoc>("Villager", VillagerSchema);

export default Villager;
