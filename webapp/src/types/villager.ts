// Rust `VillagerDef` 와 일치 — bevy-rogue 의 villagers.ron 형식

export interface VillagerDef {
  name: string;
  /** RGB 0.0~1.0 */
  color: [number, number, number];
  dialogs: string[];
  questId: string | null;
  speed: number;
}

export interface VillagerDocument extends VillagerDef {
  _id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface VillagerRevisionDocument {
  _id: string;
  villagerId: string;
  version: number;
  villager: VillagerDef;
  createdAt: string;
}
