// 엔딩 메타 데이터 — EndingScreen 표시용.
// 4 주차: 6 엔딩 (main / spirit / goblin_friend / fail / shopkeeper / wizard_apprentice).
// 각 항목에 한국어 에필로그 200~400 자 + 이모지 icon.

export type EndingId =
  | "main"
  | "spirit"
  | "fail"
  | "shopkeeper"
  | "goblin_friend"
  | "wizard_apprentice";

export type EndingMeta = {
  title: string;
  epilogue: string;
  icon: string;
};

export const endingsMeta: Record<EndingId, EndingMeta> = {
  main: {
    title: "메인 엔딩 — 비밀 간식",
    epilogue:
      "장로의 흐뭇한 미소가 마을 전체로 번진다. 너의 모험은 작은 호의 하나에서 시작되었지만, 마을은 이제 너의 이름을 또렷이 기억한다. 광장의 새벽이 다시 밝아 올 때, 누군가가 너의 발걸음을 따라 길을 떠나게 될 것이다.",
    icon: "🍪",
  },
  spirit: {
    title: "비밀 엔딩 — 산신령의 동행",
    epilogue:
      "산신령이 깨달음을 전한다. 너는 더 이상 마을의 너가 아니다 — 안개 너머의 너가 되었다. 길은 늘 거기 있었고, 안경은 단지 시야를 빌려 주었을 뿐. 너는 이제 다른 이의 길을 비추는 등불이 된다. 마을은 너를 추억으로 간직한다.",
    icon: "🌲",
  },
  fail: {
    title: "실패 엔딩 — 마을 추방",
    epilogue:
      "박씨의 고함이 시장 전체를 흔든다. 의심은 진실보다 빨리 번지고, 광장의 사람들은 등을 돌렸다. 너는 뒷골목을 지나 마을 밖으로 쫓겨난다. 발걸음은 가볍지 않지만 — 아직 길은 끝나지 않았다. 어디로 가야 할지는 너의 다음 선택이 정한다.",
    icon: "💀",
  },
  shopkeeper: {
    title: "정착 엔딩 — 시장의 새 주인",
    epilogue:
      "모험 대신 좌판을 펼친다. 행상인의 두루마리를 받아 들고, 너는 시장 한쪽에 자리를 잡는다. 박씨가 의심스럽게 보지만 — 이제 너는 그의 이웃이다. 광장의 새벽이 밝아 올 때마다, 너는 빵을 굽고 약초를 다듬는다. 누군가의 모험을 응원하면서.",
    icon: "🏪",
  },
  goblin_friend: {
    title: "비밀 엔딩 — 도깨비 친구",
    epilogue:
      "도깨비가 너의 손을 잡았다. 마을의 길은 이제 너의 것이 아니다 — 동굴 속의 또 다른 세계가 너를 부른다. 부적이 손목에서 부드럽게 빛난다. 도깨비의 노래가 동굴 깊은 곳에서 너를 기다린다. 너는 이미 그곳의 일부이다.",
    icon: "👹",
  },
  wizard_apprentice: {
    title: "비밀 엔딩 — 마법사 제자",
    epilogue:
      "마법사가 너에게 마법서의 첫 장을 손수 펼쳐 준다 — *\"제자란 단지 *읽는 자* 가 아니라, 글자를 *살리는 자* 다.\"* 산기슭의 작은 오두막이 너의 새 집이 된다. 마을의 광장은 멀리 떨어졌지만, 마법사의 말이 너의 안에서 깊어진다. 너는 이제 글자를 짓는 사람이 된다.",
    icon: "📚",
  },
};

export function getEndingMeta(endingId: string): EndingMeta {
  return (
    endingsMeta[endingId as EndingId] ?? {
      title: `엔딩 — ${endingId}`,
      epilogue: "모험이 끝났습니다.",
      icon: "✨",
    }
  );
}
