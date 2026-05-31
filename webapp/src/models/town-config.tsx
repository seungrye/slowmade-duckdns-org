import { Schema, model, models, Model } from "mongoose";
import { TOWN_LANDMARKS, TOWN_ENVIRONMENTS, type TownLandmark, type TownEnvironment } from "@/types/town-config";

// 단일 doc 패턴 — collection 에 항상 0개 또는 1개. _id 는 고정 문자열 "default".
// 게임 측 `TownOptions` (bevy-rogue) 와 1:1 매핑.
// 시작 마을(Town, ZoneId::Town) 의 generator 옵션을 보관.

const TownConfigSchema = new Schema(
  {
    _id: { type: String, default: "default" },
    // string enum — 모델 단계에서 잘못된 값 차단. validation 에서 한번 더 검사.
    size:     { type: String, required: true, enum: ["hamlet", "village", "town"], default: "village" },
    roads:    { type: String, required: true, enum: ["radial", "linear", "random"], default: "radial" },
    wealth:   { type: String, required: true, enum: ["poor", "common", "wealthy"], default: "common" },
    defenses: { type: String, required: true, enum: ["none", "wooden", "stone"], default: "none" },
    landmarks: {
      type: [String],
      default: ["inn", "smithy"],
      validate: {
        validator: (arr: string[]) =>
          arr.every((v) => (TOWN_LANDMARKS as readonly string[]).includes(v)),
        message: "landmarks 에 알 수 없는 값이 있습니다.",
      },
    },
    fields:  { type: Boolean, required: true, default: true },
    // 신규 — Plains/Coastal 분기. Coastal 일 때만 docks landmark 가 노출된다.
    environment: {
      type: String,
      required: true,
      enum: TOWN_ENVIRONMENTS,
      default: "plains" satisfies TownEnvironment,
    },
    // 신규 — 마을 생성 알고리즘. 기본 Grid (현재 구현). Tinykeep/Watabou 는 stub.
    algorithm: {
      type: String,
      required: true,
      enum: ["grid", "tinykeep", "watabou"],
      default: "grid",
    },
    version: { type: Number, default: 1 },
  },
  { timestamps: true, _id: false }
);

export type TownAlgorithm = "grid" | "tinykeep" | "watabou";
export const TOWN_ALGORITHMS: readonly TownAlgorithm[] = ["grid", "tinykeep", "watabou"];

export interface TownConfigDoc {
  _id: string;
  size: "hamlet" | "village" | "town";
  algorithm: TownAlgorithm;
  roads: "radial" | "linear" | "random";
  wealth: "poor" | "common" | "wealthy";
  defenses: "none" | "wooden" | "stone";
  landmarks: TownLandmark[];
  fields: boolean;
  environment: TownEnvironment;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

const TownConfig: Model<TownConfigDoc> =
  models.TownConfig || model<TownConfigDoc>("TownConfig", TownConfigSchema);

export default TownConfig;
