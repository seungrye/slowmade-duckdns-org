// 같은 롬을 올렸을 때 물려줄 패치 고르기 (#190).
//
// 롬·패치에 sha256 이 생기면서(#188) "같은 롬" 을 바이트로 판정할 수 있게 됐다. IPS 는 자체
// 체크섬이 없어 파일만으로는 대상 롬을 알 수 없는데, **먼저 올린 사람이 정확히 그 해시의
// 롬에 붙였다는 사실**이 곧 호환성 근거가 된다.
//
// 이 모듈이 지키는 것은 하나다 — **모호하면 아무것도 하지 않는다.** 같은 롬에 한글 패치와
// 영어 패치가 각각 올라와 있을 수 있고, 아무거나 고르면 올린 사람이 원하지 않은 언어로
// 게임이 바뀐다. 카드 체크박스는 "패치 켜짐/꺼짐"만 보여 주지 어느 패치인지까지 따지게
// 하지는 않으므로, 갈리면 손을 뗀다.

/** 저장된 해시의 모양. 빈 값·다른 모양은 "모른다"는 뜻이라 후보에서 뺀다. */
const SHA256_HEX = /^[0-9a-f]{64}$/;

export interface InheritablePatch {
  name: string;
  format: string;
  size: number;
  /** 복사해 올 원본 오브젝트 키. */
  objectKey: string;
  sha256: string;
}

/**
 * 물려줄 패치 하나, 없으면 `null`.
 *
 * - 해시나 `objectKey` 를 모르는 후보는 버린다(백필 전 문서, 깨진 항목).
 * - 남은 것들의 바이트가 **모두 같을 때만** 하나를 고른다.
 * - 하나라도 다르면 `null` — 어느 쪽이 맞는지 우리가 알 방법이 없다.
 */
export function pickInheritablePatch(
  candidates: readonly Partial<InheritablePatch>[],
): InheritablePatch | null {
  const usable = candidates.filter(
    (c): c is InheritablePatch =>
      typeof c?.sha256 === 'string' &&
      SHA256_HEX.test(c.sha256) &&
      typeof c.objectKey === 'string' &&
      c.objectKey.length > 0,
  );
  if (!usable.length) return null;

  const first = usable[0];
  // 바이트가 갈리면 고르지 않는다.
  if (usable.some((c) => c.sha256 !== first.sha256)) return null;
  return first;
}
