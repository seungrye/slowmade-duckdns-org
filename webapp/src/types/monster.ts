// Matching the Rust `MonsterDef` - bevy-rogue's monsters.ron format
// (mirroring MonsterDef in src/modules/monster/mod.rs 1:1)

import type { Condition, SpawnZone } from "./quest";

/** A monster's elemental attribute. "poison" is absent from weapons but exists on monsters. */
export type MonsterElement = "fire" | "ice" | "poison" | "lightning";

export interface MonsterDef {
  /** The stable English identifier (snake_case). The key QuestAction::SpawnMonster references. */
  id: string;
  /** The Korean name for the UI and the log. */
  displayName: string;
  /** A single glyph. */
  glyph: string;
  /** RGB 0.0~1.0 */
  color: [number, number, number];
  hp: number;
  attack: number;
  defense: number;
  visionRadius: number;
  speed: number;
  /** "fire"/"ice"/"poison"/"lightning", or null. */
  element: MonsterElement | null;
  /** The natural spawn weight (1.0 by default). */
  spawnWeight: number;
  /** The zones it appears in (ZoneId). Empty means every ordinary zone (no restriction). */
  zones: SpawnZone[];
  /** It spawns naturally only when this is true (absent, always). Reusing QuestCondition. */
  spawnCondition?: Condition;
  /** true means it never spawns naturally - it appears only through SpawnMonster (bosses and quests). */
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
