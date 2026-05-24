// Rust `VillagerDef` 와 일치 — bevy-rogue 의 villagers.ron 형식

export interface VillagerDef {
  /** unique 식별자 (snake_case). 퀘스트 giver_npc / KillNpc 가 참조. */
  id: string;
  /** UI/dialog 표시용 이름 (unique 보장 X) */
  name: string;
  /** RGB 0.0~1.0 */
  color: [number, number, number];
  dialogs: string[];
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
