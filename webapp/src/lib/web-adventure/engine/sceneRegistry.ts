// 씬 레지스트리 — 단일 객체 lookup 으로 reducer 가 씬을 찾는다.
// 2 주차 이후 씬이 늘어나면 여기에 추가만 하면 됨.

import type { SceneRegistry } from "@/types/web-adventure";
import { townSquareDawn } from "@/content/web-adventure/scenes/town_square_dawn";
import { elderEnding } from "@/content/web-adventure/scenes/elder_ending";

export const scenes: SceneRegistry = {
  [townSquareDawn.id]: townSquareDawn,
  [elderEnding.id]: elderEnding,
};

export const START_SCENE_ID = townSquareDawn.id;
