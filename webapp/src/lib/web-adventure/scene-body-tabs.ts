// 씬 CMS 본문 탭 — [트리트먼트 | 기본 | 톨킨 풍 | + 문체추가] (#79).
//
// 씬 하나에 텍스트 묶음이 셋 있다:
//   treatment  사건의 뼈대(집필용 정본). **화면에 절대 나가지 않는다.**
//   body       기본 문체 본문. 변형이 없을 때의 폴백이기도 하다.
//   variants   문체별 본문 { [voice]: string[] } — 자유 키라 작가를 늘려도 스키마를 안 고친다.
//
// 읽기/쓰기 규칙만 순수 함수로 떼어 둔다. 폼은 이 함수들을 부르기만 하므로
// 탭이 늘어나도 UI 코드를 고칠 일이 없다.

/** 트리트먼트 탭의 내부 키 — 문체 이름과 겹치지 않도록 콜론을 쓴다. */
export const TREATMENT_TAB = ':treatment';
/** 기본 본문 탭의 내부 키. */
export const BODY_TAB = ':body';

export interface TabbedScene {
  body?: string[];
  treatment?: string[];
  variants?: Record<string, string[]>;
}

/** 사람이 읽는 탭 이름. 모르는 문체는 키를 그대로 쓴다. */
const LABELS: Record<string, string> = {
  [TREATMENT_TAB]: '트리트먼트',
  [BODY_TAB]: '기본',
  tolkien: '톨킨 풍',
  prose: '산문 풍',
};

export function tabLabel(tab: string): string {
  return LABELS[tab] ?? tab;
}

/**
 * 보여 줄 탭 목록. 트리트먼트·기본이 앞, 문체가 이름순으로 뒤.
 * 값이 빈 변형도 탭으로 남긴다 — 작성 중인 문체가 사라지면 안 된다.
 */
export function bodyTabs(scene: TabbedScene): string[] {
  const voices = Object.keys(scene.variants ?? {}).sort();
  return [TREATMENT_TAB, BODY_TAB, ...voices];
}

/** 그 탭이 담고 있는 문단 배열. 없으면 빈 배열. */
export function readTab(scene: TabbedScene, tab: string): string[] {
  if (tab === TREATMENT_TAB) return scene.treatment ?? [];
  if (tab === BODY_TAB) return scene.body ?? [];
  return scene.variants?.[tab] ?? [];
}

/** 그 탭만 갈아끼운 새 씬을 돌려준다(원본은 건드리지 않는다). */
export function writeTab<T extends TabbedScene>(scene: T, tab: string, lines: string[]): T {
  if (tab === TREATMENT_TAB) return { ...scene, treatment: lines };
  if (tab === BODY_TAB) return { ...scene, body: lines };
  return { ...scene, variants: { ...(scene.variants ?? {}), [tab]: lines } };
}
