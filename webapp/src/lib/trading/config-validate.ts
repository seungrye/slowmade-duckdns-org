// 전략 config 검증 — **순수** (#507). 저장 전 마지막 문이다.
//
// 라우트 파일에서 떼어냈다: Next.js 의 route 모듈은 정해진 export 만 허용해서 임의 함수를
// 내보내면 타입 검사가 깨진다. 순수 모듈로 두면 테스트도 쉽다.
/** 양수여야 하는 값인가 — 빈문자열·0·음수·NaN 을 전부 거른다 (#507). */
const 양수 = (v: unknown) => typeof v !== "boolean" && v !== "" && v !== null
  && v !== undefined && Number.isFinite(Number(v)) && Number(v) > 0;

/**
 * 전략별 config 검증 — **순수**. 저장 전 마지막 문이다 (#507).
 *
 * 여기서 안 막으면 0·빈문자열이 주문 수량·가격 계산에 그대로 들어간다. 실제로 #491 에서
 * 평단 0 이 0원 매도를 만든 적이 있다 — 같은 계열의 입력을 입구에서 끊는다.
 */
export function validateStrategyConfig(
  strategy: string, cfg: Record<string, unknown>,
): string | null {
  const 필수양수 = (keys: string[]) => {
    for (const k of keys) if (!양수(cfg[k])) return `config.${k} 는 양수여야 합니다`;
    return null;
  };
  const 선택양수 = (keys: string[]) => {
    for (const k of keys) {
      if (cfg[k] === undefined) continue;
      if (!양수(cfg[k])) return `config.${k} 를 적었으면 양수여야 합니다`;
    }
    return null;
  };

  if (strategy === "infinite_v4") {
    if (!cfg.symbol) return "config.symbol 이 필요합니다";
    return 필수양수(["principal"]) ?? 선택양수(["splits", "starBase", "sellTarget"]);
  }
  if (strategy === "value_rebalancing") {
    if (!cfg.symbol) return "config.symbol 이 필요합니다";
    return 필수양수(["principal", "gradient"])
      ?? 선택양수(["bandPct", "poolLimitPct", "cycleDays", "initStockRatio", "feeRate"]);
  }
  if (strategy === "lrs_v1") {
    if (!cfg.signal || !cfg.target) return "config.signal·target 이 필요합니다";
    return 선택양수(["sma", "band"]);
  }
  if (strategy === "rotation_v1") {
    if (!cfg.signal) return "config.signal 이 필요합니다";
    return 선택양수(["sma", "band", "mom", "rebalance"]);
  }
  if (strategy === "trend_v1") {
    const hasUni = typeof cfg.universeRef === "string"
      || (Array.isArray(cfg.universe) && cfg.universe.length > 0);
    if (!hasUni) return "config.universeRef 또는 universe(비어 있지 않은 배열)가 필요합니다";
    return 선택양수(["shortMa", "longMa", "positionSize"]);
  }
  return null;
}
