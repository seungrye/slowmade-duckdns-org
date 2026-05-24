// Rust `MonsterDef` 와 일치 — bevy-rogue 의 monsters.ron 형식
// (src/modules/monster/mod.rs 의 MonsterDef 를 1:1 미러링)

import type { Condition, SpawnZone } from "./quest";

/** 몬스터 원소 속성. "poison" 은 무기엔 없지만 몬스터에는 존재한다. */
export type MonsterElement = "fire" | "ice" | "poison" | "lightning";

export interface MonsterDef {
  /** 영문 안정 식별자 (snake_case). QuestAction::SpawnMonster 가 참조하는 키. */
  id: string;
  /** UI/log 표시용 한글 이름. */
  displayName: string;
  /** 단일 글리프. */
  glyph: string;
  /** RGB 0.0~1.0 */
  color: [number, number, number];
  hp: number;
  attack: number;
  defense: number;
  visionRadius: number;
  speed: number;
  /** "fire"/"ice"/"poison"/"lightning" 또는 null. */
  element: MonsterElement | null;
  /** 자연 스폰 가중치 (기본 1.0). */
  spawnWeight: number;
  /** 나오는 존 목록 (ZoneId). 비어있으면 모든 일반 존 (제한 없음). */
  zones: SpawnZone[];
  /** 참일 때만 자연 스폰 (없으면 항상). QuestCondition 재사용. */
  spawnCondition?: Condition;
  /** true 면 자연 스폰 안 됨 — SpawnMonster 로만 등장 (보스/퀘스트 전용). */
  questOnly: boolean;
}

export interface MonsterDocument extends MonsterDef {
  _id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MonsterRevisionDocument {
  _id: string;
  monsterId: string;
  version: number;
  monster: MonsterDef;
  createdAt: string;
}
