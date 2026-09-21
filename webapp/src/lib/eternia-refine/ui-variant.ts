// 손패 UI 변종 (#475) — 순수.
//
// 제보: 「카드 선택이 불편하다」. 실측해 보니 카드가 겹쳐 **침식 값이 4/5·7/8 가려지고**
// (카엘은 이름까지 7/8), 안 고른 카드의 본문은 opacity 0 이라 한 번에 한 장만 읽힌다.
//
// 고칠 길이 하나가 아니라서 말로 정하지 않는다. **배치 3 × 앞면 3 = 9가지를 다 만들고**
// 굴려 본 뒤 엔딩에서 의견을 받는다.
//
// ── 왜 두 축인가 ────────────────────────────────────────────────────
//
// 섞여 있던 두 문제를 갈라 놓은 것이다.
//   - **배치**는 «읽히는가»의 문제다. 겹치면 정보가 사라진다.
//   - **앞면**은 «알아보는가»의 문제다. 이름만 있으면 읽어야 하고, 도형이 있으면 본다.
// 둘은 독립이라 아무렇게나 섞인다. 그래서 하나의 목록이 아니라 두 축이다.
//
// 이 파일이 **이름의 단일 출처**다. 화면·시험·e2e 가 전부 여기서 가져간다 —
// 어긋나면 시험이 거짓으로 통과한다.

/** 손패를 어떻게 늘어놓나. */
export type Layout =
  /** 지금. 부채꼴로 겹친다. */
  | 'fan'
  /** 작은 인장 띠 + 고른 것만 위에서 크게 (Overview+Detail). */
  | 'rail'
  /** 겹치지 않는 2줄 격자. */
  | 'grid';

/** 카드 앞면에 무엇을 그리나. */
export type Face =
  /** 지금. 비용과 이름만. */
  | 'plain'
  /** 안 가려지는 왼쪽 띠에 비용·효과 도형·침식을 세로로. */
  | 'index'
  /** 카드 데이터에서 계산한 인장. */
  | 'sigil';

export const LAYOUTS: readonly Layout[] = ['fan', 'rail', 'grid'] as const;
export const FACES: readonly Face[] = ['plain', 'index', 'sigil'] as const;

export interface Variant {
  /** `fan:plain` 처럼. 주소·저장·분석에 이 문자열 하나만 다닌다. */
  id: string;
  layout: Layout;
  face: Face;
}

/** 아홉 가지 전부. 순서는 고정 — 시험이 이 순서를 본다. */
export const VARIANTS: readonly Variant[] = LAYOUTS.flatMap((layout) =>
  FACES.map((face) => ({ id: `${layout}:${face}`, layout, face })),
);

/** 지금까지의 동작 — `?ui=` 가 없고 백도 못 읽을 때의 기본값. */
export const DEFAULT_VARIANT: Variant = VARIANTS.find((v) => v.id === 'fan:plain')!;

/**
 * `rail:sigil` 같은 문자열을 변종으로. 모르는 값이면 null.
 *
 * `?ui=` 로 특정 조합을 박는 데 쓴다 — e2e 가 흔들리지 않게 붙잡는 손잡이이자,
 * 직접 아홉 가지를 견줘 보는 길이다.
 */
export function parseVariant(raw: string | null | undefined): Variant | null {
  if (!raw) return null;
  return VARIANTS.find((v) => v.id === raw.trim()) ?? null;
}

const LAYOUT_LABEL: Record<Layout, string> = {
  fan: '부채',
  rail: '띠',
  grid: '격자',
};

const FACE_LABEL: Record<Face, string> = {
  plain: '이름만',
  index: '코너 인덱스',
  sigil: '문양',
};

/** 사람에게 보여 줄 이름. **투표하기 전에는 쓰지 않는다** — 답이 휘어진다. */
export function variantLabel(v: Variant): string {
  return `${LAYOUT_LABEL[v.layout]} + ${FACE_LABEL[v.face]}`;
}
