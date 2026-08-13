// 분할(split) 롬셋 판별 (#143).
//
// 아케이드 클론 셋은 리전별 파일만 담고 나머지는 부모 zip 에 있다. 여러 zip 을 한 번에 올렸을 때
// **무엇이 게임(클론)이고 무엇이 부모인지**를 가려야 한다.
//
// 단서는 이름이다. MAME·FBA 는 **클론 이름이 부모 이름으로 시작한다** —
// `ddsom`(부모) → `ddsoma`·`ddsomu`·`ddsomr1`(클론). 그래서 **앞가지인 쪽이 부모**다.
//
// 규칙에 안 맞으면 `ambiguous` 로 알린다. 조용히 찍으면 엉뚱한 리전으로 부팅하는데,
// 그건 알아채기 어려운 종류의 잘못이다.

export interface RomSetClassification {
  /** 코어에 넘길 게임 이름 — 이 zip 의 이름이 곧 롬셋 이름이다. */
  game: string | null;
  /** 함께 놓을 부모들. **일반적인 것부터** 나열된다 — 코어가 필요할 때 거슬러 찾는다. */
  parents: string[];
  /** 이름 규칙으로 못 가렸다 — 화면에서 확인을 받는 편이 좋다. */
  ambiguous: boolean;
  /** 화면에 그대로 보여 줄 한 줄. */
  summary: string;
}

/** 확장자를 떼고 소문자로. */
const base = (name: string) => name.replace(/\.[^.]*$/, '').toLowerCase();

export function classifyRomSet(filenames: string[]): RomSetClassification {
  const names = filenames.filter(Boolean);
  if (names.length === 0) {
    return { game: null, parents: [], ambiguous: false, summary: '올린 파일이 없습니다.' };
  }
  if (names.length === 1) {
    return { game: names[0], parents: [], ambiguous: false, summary: `게임: ${names[0]}` };
  }

  // 이름이 짧은 것부터 = 일반적인 것부터. 가장 긴 것이 게임(가장 구체적인 클론).
  const sorted = [...names].sort((a, b) => base(a).length - base(b).length);
  const game = sorted[sorted.length - 1];
  const parents = sorted.slice(0, -1);

  // 규칙 확인 — 앞의 것이 뒤의 것의 앞가지여야 한다. 같은 이름이 섞여도 어긋난 것으로 본다.
  const bases = sorted.map(base);
  const ambiguous =
    new Set(bases).size !== bases.length ||
    bases.some((b, i) => i > 0 && !bases[i].startsWith(bases[i - 1]));

  const summary = ambiguous
    ? `이름 규칙으로 가리지 못했습니다 — 게임을 ${game} 로 봅니다. 함께 병합: ${parents.join(', ')}`
    : `게임: ${game} · 함께 병합: ${parents.join(', ')}`;

  return { game, parents, ambiguous, summary };
}
