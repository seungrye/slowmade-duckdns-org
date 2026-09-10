// 지도 좌표 계산 (#457) — 순수 함수.
//
// MapScreen 에서 떼어냈다. 폭 계산이 틀려 모바일에 가로 스크롤이 생겼는데(제보), 화면 안에
// 있으면 브라우저 없이는 못 잰다. 여기로 내리면 폭을 훑어 가며 test 할 수 있다.
//
// ── 가로는 맞추고 세로는 스크롤한다 ─────────────────────────────────
//
// 예전 주석은 "화면에 맞추지 않는다 — 넘치면 스크롤"이었다. 그건 **세로에만** 맞는 말이다.
// 층이 많아 아래위로 넘치는 것은 앞을 내다보는 몸짓이지만, 가로로 넘치면 지도를 읽을 수 없다.
//
// 예전 폭 계산은 노드 **좌표만** 셌다(`PAD*2 + (maxWide-1)*COL_GAP`). label 은 노드 가운데에
// 붙는데 그 너비를 안 세서, 맨 오른쪽 label 이 폭 밖으로 나가 가로 스크롤이 났다.

/** 층 간격 — 폭과 무관하다. 세로는 줄이지 않는다. */
const ROW_GAP = 96;

/** 세로 여백. */
const ROW_PAD = 48;

/** 칸 간격 상한 — 넓은 화면에서 지도가 흩어지지 않게. */
const MAX_COL_GAP = 220;

/** 한 글자가 먹는 폭(px). 한글은 전각이라 글자 크기와 거의 같다. */
const CHAR_W = 11;

/** 아무리 좁아도 이만큼은 남긴다 — 이름이 통째로 사라지면 길을 못 고른다. */
const MIN_LABEL_CHARS = 4;

export interface MapGeometry {
  /** SVG 폭 — 컨테이너와 같다. 그래서 넘칠 여지가 없다. */
  width: number;
  height: number;
  /** 좌우 여백 겸 맨 바깥 label 의 반폭. */
  pad: number;
  colGap: number;
  rowGap: number;
  /** label 한 칸에 주는 폭. */
  labelWidth: number;
}

/**
 * 칸 폭과 여백을 컨테이너 폭에서 역산한다.
 *
 * label 은 노드 가운데에 붙고 폭이 `colGap` 이다. 맨 바깥 label 이 딱 들어오려면
 * 여백이 그 반폭이어야 한다:
 *
 * ```
 * colGap = (width - 2·pad) / (maxWide - 1),  pad = colGap / 2
 *   =>  colGap · (maxWide - 1) + colGap = width
 *   =>  colGap = width / maxWide,  pad = colGap / 2
 * ```
 *
 * 그래서 맨 오른쪽 label 의 오른끝이 정확히 `width` 다. 넓은 화면에서는 `MAX_COL_GAP` 로
 * 묶고 남는 폭은 양옆 여백으로 보낸다.
 */
export function mapGeometry(width: number, rows: number, maxWide: number): MapGeometry {
  const w = Math.max(1, width);
  const ideal = w / Math.max(1, maxWide);
  const colGap = Math.min(MAX_COL_GAP, ideal);
  // 상한에 걸려 좁아진 만큼은 여백으로 돌려 가운데 정렬한다.
  const span = (maxWide - 1) * colGap;
  const pad = (w - span) / 2;

  return {
    width: w,
    height: ROW_PAD * 2 + Math.max(0, rows - 1) * ROW_GAP,
    pad,
    colGap,
    rowGap: ROW_GAP,
    labelWidth: colGap,
  };
}

/** 그 칸 폭에 들어가는 글자 수. */
export function labelChars(labelWidth: number): number {
  return Math.max(MIN_LABEL_CHARS, Math.floor(labelWidth / CHAR_W));
}

/** 길면 자르고 말줄임을 붙인다. */
export function clipLabel(text: string, labelWidth: number): string {
  const max = labelChars(labelWidth);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
