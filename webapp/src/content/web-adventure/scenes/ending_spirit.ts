// 비밀 엔딩 — 산신령의 동행.

import type { Scene } from "@/types/web-adventure";

export const endingSpirit: Scene = {
  id: "ending_spirit",
  illustration: "/web-adventure/scenes/forest.jpg",
  title: "산신령의 동행 — 비밀 엔딩",
  body: [
    "안개가 걷히자 늙은 산신령이 너의 앞에 섰다.",
    "그는 말없이 한참을 보다가, 단 한 마디만 남긴다 — *\"기억하라. 길은 늘 거기 있었다.\"*",
    "(너는 마을로 돌아가지 않는 길을 택했다.)",
  ],
  choices: [],
  isEnding: true,
  endingId: "spirit",
};
