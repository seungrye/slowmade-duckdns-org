/**
 * 블록(포트폴리오)이 굴리는 종목 — 순수 (#372).
 *
 * `block-snapshot.ts` 안에 사설 함수로 있던 표를 끌어올렸다. 블록별 자산 스냅샷과
 * 체결 귀속이 **같은 질문**("이 블록은 어떤 종목을 다루나")을 하는데 답을 두 벌 두면
 * 어긋난다 — #352·#354 가 정확히 그런 식으로 틀어졌다.
 *
 * | 전략 | 종목 |
 * |---|---|
 * | `infinite_v4` · `value_rebalancing` | `config.symbol` |
 * | `lrs_v1` | `config.target` |
 * | `trend_v1` | `config.universe` |
 * | `rotation_v1` | **모름**(후보 자동선발) → `null` |
 *
 * 모르면 `null` 이다. 빈 배열이 아니다 — "다루는 종목이 없다"와 "모른다"는 다르다.
 */
export function blockSymbols(config: Record<string, unknown>): string[] | null {
  if (typeof config.symbol === "string") return [config.symbol];
  if (typeof config.target === "string") return [config.target];
  if (Array.isArray(config.universe)) {
    return config.universe.filter((s): s is string => typeof s === "string");
  }
  // rotation 처럼 후보를 자동 선발하는 전략은 config 만으로 알 수 없다.
  return null;
}
