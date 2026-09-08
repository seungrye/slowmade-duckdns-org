// The Named zone definitions - webapp's metadata catalogue for the dynamic zones
// bevy-rogue's OpenPortal action registers. There is no 1:1 RON file.

/**
 * The TS mirror of the game's `ZoneId` enum variants. Used by a villager's `homeZone` and so on.
 *
 * Matching the game's `pub enum ZoneId` in `src/modules/zone/mod.rs` 1:1:
 *   - `Town` - the starting town (the only static variant)
 *   - `Named("…")` - every other zone (forest / dungeon_N / mountain_village /
 *     seaside_harbor and the quests' dynamic zones alike)
 *
 * The standard Named ids:
 *   - `"forest"` - the forest
 *   - `"dungeon_<N>"` - dungeon floor N
 *   - `"mountain_village"` - the mountain village
 *   - `"seaside_harbor"` - the harbour village
 *
 * The RON encoding (see the villager serialisation in `lib/ron.ts` for detail):
 *   - `Town` - a bare ident
 *   - `Named("herb_glade")` - the paren form
 *
 * Compatibility: the old RON's `Forest` / `Dungeon(N)` / `MountainVillage` / `SeasideHarbor`
 * are absorbed into the Named form by the parser automatically.
 */
export type ZoneIdValue =
  | { type: "Town" }
  | { type: "Named"; id: string };

/** A human-readable label for `ZoneIdValue` - used by the UI's selects and displays. */
export function zoneIdLabel(z: ZoneIdValue): string {
  if (z.type === "Town") return "마을 (Town)";
  // A friendly label for the standard Named ids, the raw identifier otherwise.
  switch (z.id) {
    case "forest":           return "숲 (forest)";
    case "mountain_village": return "산속 마을 (mountain_village)";
    case "seaside_harbor":   return "항구 마을 (seaside_harbor)";
    default: {
      const m = /^dungeon_(\d+)$/.exec(z.id);
      if (m) return `던전 ${m[1]}층 (${z.id})`;
      return `Named("${z.id}")`;
    }
  }
}

export interface ZoneDef {
  name: string;
  /** The map generator (bsp / forest / cellular_automata / bsp_indoor / organic_village and so on) */
  generator: string;
  description?: string;
}

export interface ZoneDocument extends ZoneDef {
  _id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ZoneRevisionDocument {
  _id: string;
  zoneId: string;
  version: number;
  zone: ZoneDef;
  createdAt: string;
}
