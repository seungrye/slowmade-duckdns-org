// 엔딩 메타 데이터 — EndingScreen 표시용.
// 2 주차 2 엔딩 (main / spirit). 3~4 주차에 fail / shopkeeper 등 확장.

export type EndingMeta = { title: string; epilogue: string };

export const endingsMeta: Record<string, EndingMeta> = {
  main: {
    title: "메인 엔딩 — 비밀 간식",
    epilogue:
      "장로의 흐뭇한 미소가 마을 전체로 번진다. 너의 모험은 작은 호의 하나에서 시작되었다.",
  },
  spirit: {
    title: "비밀 엔딩 — 산신령의 동행",
    epilogue:
      "산신령이 깨달음을 전한다. 너는 더 이상 마을의 너가 아니다 — 안개 너머의 너가 되었다.",
  },
};

export function getEndingMeta(endingId: string): EndingMeta {
  return (
    endingsMeta[endingId] ?? {
      title: `엔딩 — ${endingId}`,
      epilogue: "모험이 끝났습니다.",
    }
  );
}
