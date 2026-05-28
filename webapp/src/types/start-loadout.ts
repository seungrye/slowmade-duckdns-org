// 새 게임 시작 시 플레이어 기본 인벤토리·장비·금화.
// 게임 측 Rust `StartLoadout` (src/modules/item/mod.rs) 와 1:1 매핑.
//
//   gold:        시작 금화 (>= 0)
//   weapon:      장착 무기 id. null 이면 미장착. (weapons.ron 의 id 참조)
//   armor:       장착 방어구 id. null 이면 미장착. (armors.ron 의 id 참조)
//   items:       인벤토리에 들어갈 무기/방어구 id 목록. 중복 허용.
//   consumables: 소모품 (id, count) 튜플 목록. count >= 1.

export interface StartLoadoutConsumable {
  id: string;
  count: number;
}

export interface StartLoadoutDef {
  gold: number;
  weapon: string | null;
  armor: string | null;
  items: string[];
  consumables: StartLoadoutConsumable[];
}

export interface StartLoadoutDocument extends StartLoadoutDef {
  _id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
