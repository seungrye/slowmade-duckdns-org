// 메인 엔딩 — 비밀 간식을 전달한 결과.
// 1 주차의 elder_ending 을 대체한다 (이름 변경 + 본문 갱신).

import type { Scene } from "@/types/web-adventure";

export const endingMain: Scene = {
  id: "ending_main",
  illustration: "/web-adventure/scenes/elder-house.png",
  title: "장로의 비밀 간식 — 메인 엔딩",
  body: [
    "장로는 보따리를 풀어 본다. 익숙한 향, 익숙한 모양.",
    "그가 흐뭇한 미소를 짓는다 — *\"고맙네. 자네가 마을의 다음 이야기를 들고 와 줬군.\"*",
  ],
  choices: [],
  isEnding: true,
  endingId: "main",
};
