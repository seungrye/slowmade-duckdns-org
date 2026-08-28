// 누가 무엇을 고쳤는지 가리는 규칙 (#279).
//
// 파이프라인에는 금지가 **두 방향**이다 — 코더는 테스트를 못 만지고, 클로드는 구현을 못
// 만진다. 앞쪽은 기계로 막고 있었는데 뒤쪽은 프롬프트로만 막고 있었다. 이 세션에서
// "프롬프트로 막았다" 가 세 번 깨졌으므로 둘 다 기계로 막는다.
//
// 처음엔 **파일 이름만** 비교했다. 그러면 **기존 파일을 고친 것을 놓친다** — 새로 만든 것만
// 잡히고 내용이 바뀐 것은 지나간다. 그래서 내용으로 비교한다.
//
// 스크립트(node)와 테스트(vitest)가 같은 파일을 쓴다. 두 벌로 두면 한쪽만 고쳐지는 날이 온다.

/** 테스트 파일인가. 확장자로만 본다 — 이름에 test 가 들어간 것은 테스트가 아니다. */
export const isTest = (p) => /\.test\.(ts|tsx)$/.test(p);

/**
 * 구현 파일인가 — webapp 안의 테스트 아닌 것.
 *
 * `docs/spec/` 이나 `scripts/` 는 구현이 아니다. 스펙 파일을 구현으로 치면 클로드가 스펙을
 * 남길 때마다 되돌아간다.
 */
export const isImpl = (p) => p.startsWith('webapp/') && !isTest(p);

/**
 * `changedPaths` 가 git 에 넘길 인자.
 *
 * git 은 **통째로 추적되지 않는 디렉터리를 한 줄로 접는다** — 안에 파일이 몇 개든
 * `?? webapp/src/lib/eternia-deck/` 한 줄이다. 그러면 그 안의 테스트 파일이 [isTest] 에
 * 안 걸려 "테스트가 하나도 만들어지지 않았습니다" 로 끝난다. 실제로 만들어졌는데도.
 * `--untracked-files=all` 이 그 접힘을 푼다.
 *
 * 상수로 꺼내 두는 이유는 이 인자를 네트워크·파일 없이 시험하기 위해서다 —
 * `rescue.mjs` 가 판정과 문구를 꺼내 둔 것과 같은 이유다.
 */
export const STATUS_ARGS = ['status', '--porcelain', '--untracked-files=all'];

/**
 * `git status --porcelain` 출력 한 덩이를 항목으로 나눈다.
 *
 * 앞 두 글자가 status, 세 번째 칸부터가 경로다. rename(`R  a -> b`)은 화살표 뒤를 취한다 —
 * 그게 지금 존재하는 파일이다. 빈 줄은 버린다.
 *
 * **디렉터리인지 아닌지는 여기서 판단하지 않는다** — 온 그대로 낸다. 그 판단은
 * [directoryEntries] 한 곳에만 둔다.
 *
 * @param {string} text `git status --porcelain` 의 표준출력
 * @returns {{status: string, path: string}[]} 온 순서 그대로
 */
export function parsePorcelain(text) {
  return (text ?? '')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => {
      const status = l.slice(0, 2).trim();
      const rest = l.slice(3).replace(/\s+$/, '');
      const arrow = rest.indexOf(' -> ');
      return { status, path: arrow === -1 ? rest : rest.slice(arrow + 4) };
    });
}

/**
 * 접힌 디렉터리 항목만 — 경로가 `/` 로 끝나는 것.
 *
 * git 이 "여기 안은 안 펼쳤다" 고 말하는 신호다. 이게 비어 있지 않은데 테스트가 하나도
 * 안 잡혔다면, 테스트가 없는 것이 아니라 **안 보이는 것**이다.
 *
 * @param {{status: string, path: string}[]} entries [parsePorcelain] 의 결과
 * @returns {{status: string, path: string}[]} 온 순서 그대로
 */
export function directoryEntries(entries) {
  return (entries ?? []).filter((e) => e.path.endsWith('/'));
}

/**
 * 두 스냅샷 사이에 바뀌거나 생긴 경로들.
 *
 * 지워진 것은 세지 않는다 — 되돌릴 때 원본이 남아 있으므로 문제가 되지 않는다.
 */
export function changedBetween(before, after) {
  const paths = [];
  for (const [p, text] of after) if (before.get(p) !== text) paths.push(p);
  return paths;
}
