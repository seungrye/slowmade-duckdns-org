// The player's starting inventory, equipment and gold on a new game.
// Mapped 1:1 onto the game's Rust `StartLoadout` (src/modules/item/mod.rs).
//
//   gold:        the starting gold (>= 0)
//   weapon:      the equipped weapon's id. null means none. (referencing an id in weapons.ron)
//   armor:       the equipped armour's id. null means none. (referencing an id in armors.ron)
//   items:       the weapon and armour ids to put in the inventory. Duplicates allowed.
//   consumables: the list of (id, count) tuples for consumables. count >= 1.

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
