// 덧글 앵커로 스크롤 (#241) — 순수 부분.
//
// 알림에서 덧글을 눌러 `/post/view/<글>#comment-<id>` 로 가도 스크롤이 안 됐다. 비공개 글은
// `PrivatePostGate` 가 클라이언트에서 나중에 그려서, 브라우저가 해시로 점프하려는 순간 그
// 요소가 DOM 에 없다. 나중에 생겨도 브라우저는 다시 점프하지 않는다 — 그래서 우리가 그
// 요소가 나타날 때까지 기다렸다 스크롤한다(컴포넌트는 comment-anchor.client.tsx).

/**
 * 해시에서 스크롤 대상 요소 id 를 뽑는다.
 *
 * `#comment-<덧글id>` → `comment-<덧글id>`. 덧글 앵커가 아닌 해시에는 관여하지 않는다.
 * @returns 대상 요소 id, 또는 관여하지 않을 때 null.
 */
export function targetIdFromHash(hash: string): string | null {
  const id = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!id.startsWith('comment-')) return null;
  return id;
}
