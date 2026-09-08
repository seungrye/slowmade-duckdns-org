// The Fall of Eternia's 4 stigmata (#253's refresh / #359's identity work).
//
// The modifier rules map 1:1 onto lib/web-adventure/engine/rollDice.ts.
//
// -- what a stigma is (the setting) ---------------------------------------
// [the stigma] the blue crystal that marks the body of anyone who touches magic. Using magic for strength, healing, combat or spellcraft
//   starts the contamination in *anyone*. But the ability actually *manifests* in only a few -
//   the priesthood calls them "those chosen by the three moon goddesses".
// [the truth, in 3 layers]
//   - the surface (the priesthood's doctrine): a stigma is a blessing granted to those the three goddesses (Luna, Selene, Hecate) chose.
//     Deeper contamination = drawing nearer to the goddess, and being sent to the refinery = the blessing of ascension. -> a device of faith
//     that makes the stigma-bearing body become fuel *willingly*.
//   - the middle (the first crack): the petrol is extracted from stigma crystals. "It was not a blessing but a slaughter."
//   - the deep (the real one): the goddesses' faith is a lie the priesthood invented. The true source of magic is *the world tree*. The priesthood
//     raises citizens steeped in the world tree's magic into stigma-bearers (a petrol civilisation = a fish farm) and harvests the crystals.
//     Both "being chosen" and "the cure (the refinery)" are disguises - gifted or not, whoever is contaminated ends up as fuel. That manifestation is
//     rare is no divine selection but simple individual variation and chance.
// [the ability = the few who manifested] lunar/selene/hecate. But *the protagonist starts with the stigma alone and no manifested ability*.
//   Being one of the unchosen, it does not wake by itself - they must learn how the stigma works,
//   be taught to control it (by the researcher), obtain a contamination suppressor, pay the price of raising their
//   contamination and earn the researcher's trust before *awakening later in life* (a composite gate). The awakening route is an independent, non-linear
//   story bypassing Omphalos, and both its own endings and the existing ones are reachable.
// [unmarked (none)] someone who refused magic (out of cowardice, or by their own will). With no stigma they are immune to petrification and get
//   +3 rerolls. The priesthood despises them as "those the goddesses abandoned", yet they alone are free.
// ──────────────────────────────────────────────────────────────────────────

import type { AbilityKey } from "@/types/web-adventure";

export const abilities: Record<AbilityKey, { name: string; desc: string }> = {
  lunar: { name: "루나 성흔", desc: "학식/지능 판정 +2" },
  selene: { name: "셀레네 성흔", desc: "완력/전투 판정 +2" },
  hecate: { name: "헤카테 성흔", desc: "언변/카리스마 판정 +2" },
  none: { name: "무흔", desc: "석화병 면역. 재굴림 +3 (마법 못 씀)" },
};

export const ABILITY_KEYS: AbilityKey[] = ["lunar", "selene", "hecate", "none"];
