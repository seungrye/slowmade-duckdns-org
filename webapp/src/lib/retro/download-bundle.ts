// 롬 내려받기 묶음 (#194) — 순수 부분.
//
// 조심할 것은 **이름 겹침**이다. 아케이드는 롬과 부모셋이 둘 다 zip 이고 같은 이름으로
// 올라와 있을 수 있다(`ddsoma.zip` 을 본체로도 부모로도 쓴 문서가 실제로 있었다).
// zip 안에서 이름이 겹치면 나중 것이 앞의 것을 덮어써 **파일이 조용히 사라진다.**

/** zip 안의 이름으로 쓸 수 없는 것들 — 경로 구분자와 제어문자. */
function safeName(raw: string, fallback: string): string {
  const cleaned = String(raw ?? '')
    .replace(/[/\\]/g, '_')
    // 제어문자는 파일명에 못 쓴다 — zip 도구·파일시스템이 싫어한다.
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  return cleaned || fallback;
}

/** `a.zip` → `a (2).zip`. 확장자를 살려 둔다 — 안 그러면 열리지 않는다. */
function numbered(name: string, n: number): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
}

export interface BundleParts {
  romName: string;
  /** 적용 중인 패치. 없으면 비운다. */
  patchName?: string;
  /** 아케이드 부모 롬셋들 — 이게 없으면 실행이 안 되므로 함께 넣는다. */
  parentNames?: string[];
}

/**
 * zip 에 넣을 이름들. 순서는 롬 → 패치 → 부모셋.
 *
 * **겹치면 번호를 붙여 갈라 둔다.** 덮어쓰면 받은 사람이 파일 하나를 잃는데, 그걸 알아채기가
 * 어렵다(zip 은 조용히 마지막 것만 남긴다).
 */
export function bundleEntryNames({ romName, patchName, parentNames }: BundleParts): string[] {
  const wanted = [
    safeName(romName, 'rom'),
    ...(patchName ? [safeName(patchName, 'patch')] : []),
    ...(parentNames ?? []).map((n, i) => safeName(n, `parent${i + 1}`)),
  ];

  const used = new Set<string>();
  return wanted.map((name) => {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    let n = 2;
    while (used.has(numbered(name, n))) n++;
    const unique = numbered(name, n);
    used.add(unique);
    return unique;
  });
}

/** 내려받을 zip 파일 이름. 제목이 곧 이름이라 파일시스템이 싫어하는 것만 걷어낸다. */
export function bundleFileName(title: string): string {
  // 100자면 어느 파일시스템에서도 안전하고, 제목을 알아보기에도 충분하다.
  return `${safeName(title, 'rom').slice(0, 100)}.zip`;
}
