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
 * 두 스냅샷 사이에 바뀌거나 생긴 경로들.
 *
 * 지워진 것은 세지 않는다 — 되돌릴 때 원본이 남아 있으므로 문제가 되지 않는다.
 */
export function changedBetween(before, after) {
  const paths = [];
  for (const [p, text] of after) if (before.get(p) !== text) paths.push(p);
  return paths;
}
