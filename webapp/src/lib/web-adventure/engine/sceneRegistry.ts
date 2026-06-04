// 씬 레지스트리 — 단일 객체 lookup 으로 reducer 가 씬을 찾는다.
// 컨텐츠가 늘어나면 import + 등록만 추가하면 된다.

import type { SceneRegistry } from "@/types/web-adventure";
import { townSquareDawn } from "@/content/web-adventure/scenes/town_square_dawn";
import { marketMorning } from "@/content/web-adventure/scenes/market_morning";
import { marketStorageSuccess } from "@/content/web-adventure/scenes/market_storage_success";
import { marketCaught } from "@/content/web-adventure/scenes/market_caught";
import { elderHouseArrival } from "@/content/web-adventure/scenes/elder_house_arrival";
import { forestEntry } from "@/content/web-adventure/scenes/forest_entry";
import { forestLost } from "@/content/web-adventure/scenes/forest_lost";
import { forestInner } from "@/content/web-adventure/scenes/forest_inner";
import { forestInnerWithGlasses } from "@/content/web-adventure/scenes/forest_inner_with_glasses";
import { caveEntry } from "@/content/web-adventure/scenes/cave_entry";
import { caveInside } from "@/content/web-adventure/scenes/cave_inside";
import { caveAfterSpellbook } from "@/content/web-adventure/scenes/cave_after_spellbook";
import { goblinEncounter } from "@/content/web-adventure/scenes/goblin_encounter";
import { endingMain } from "@/content/web-adventure/scenes/ending_main";
import { endingSpirit } from "@/content/web-adventure/scenes/ending_spirit";
import { endingGoblinFriend } from "@/content/web-adventure/scenes/ending_goblin_friend";

export const scenes: SceneRegistry = {
  [townSquareDawn.id]: townSquareDawn,
  [marketMorning.id]: marketMorning,
  [marketStorageSuccess.id]: marketStorageSuccess,
  [marketCaught.id]: marketCaught,
  [elderHouseArrival.id]: elderHouseArrival,
  [forestEntry.id]: forestEntry,
  [forestLost.id]: forestLost,
  [forestInner.id]: forestInner,
  [forestInnerWithGlasses.id]: forestInnerWithGlasses,
  [caveEntry.id]: caveEntry,
  [caveInside.id]: caveInside,
  [caveAfterSpellbook.id]: caveAfterSpellbook,
  [goblinEncounter.id]: goblinEncounter,
  [endingMain.id]: endingMain,
  [endingSpirit.id]: endingSpirit,
  [endingGoblinFriend.id]: endingGoblinFriend,
};

export const START_SCENE_ID = townSquareDawn.id;
