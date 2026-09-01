/**
 * 블록별 자산 스냅샷 — 순수 (#367 ②).
 *
 * `portfoliohistories` 가 (env, currency, date) 로만 저장돼, 미국 계좌에 블록이 둘
 * (TQQQ v4 · SOXL VR)이어도 USD 줄이 하나였다. 게다가 두 블록이 각각 close-sync 를 돌며
 * **같은 자리에 덮어쓰고** 있었다 — 계좌 전체 값이라 값이 같아서 안 드러났을 뿐이다.
 *
 * 블록 행에는 **그 블록이 아는 것만** 적는다. 엔진마다 자기 현금 장부가 있다.
 *
 * | 전략 | 현금 장부 | 종목 |
 * |---|---|---|
 * | `infinite_v4` | `state.v4.cycleCash` | `config.symbol` |
 * | `value_rebalancing` | `state.vr.pool` | `config.symbol` |
 * | `trend_v1` | 없음 | `config.universe` |
 * | `lrs_v1` | 없음 | `config.target` |
 * | `rotation_v1` | 없음 | **모름**(후보 자동선발) → 행을 안 쓴다 |
 *
 * 장부가 없으면 `cash` 를 **null** 로 둔다. 0 을 적으면 "현금이 없다"는 **거짓말**이 된다.
 * 종목을 모르면 아예 `null` 을 돌려줘 행을 안 쓴다 — 없는 것을 지어내지 않는다.
 */

export interface BlockSnapshot {
  /** 그 블록의 장부 현금. 장부가 없는 전략은 null. */
  cash: number | null;
  holdingsValue: number;
  /** cash + holdingsValue. cash 가 없으면 holdingsValue. */
  totalValue: number;
  symbols: string[];
}

/** 이 블록이 굴리는 종목. 모르면 null(행을 안 쓴다). */
function symbolsOf(strategy: string, config: Record<string, unknown>): string[] | null {
  const one = typeof config.symbol === "string" ? config.symbol : null;
  if (one) return [one];
  if (typeof config.target === "string") return [config.target];
  if (Array.isArray(config.universe)) {
    return config.universe.filter((s): s is string => typeof s === "string");
  }
  // rotation 처럼 후보를 자동 선발하는 전략은 config 만으로 알 수 없다.
  void strategy;
  return null;
}

/** 그 블록의 장부 현금. 없으면 null. */
function ledgerCash(strategy: string, state: Record<string, unknown>): number | null {
  const 꺼내기 = (키: string, 필드: string): number | null => {
    const s = state[키] as Record<string, unknown> | undefined;
    const v = s?.[필드];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  if (strategy === "infinite_v4") return 꺼내기("v4", "cycleCash");
  if (strategy === "value_rebalancing") return 꺼내기("vr", "pool");
  return null;
}

export function blockSnapshot(args: {
  strategy: string;
  config: Record<string, unknown>;
  state: Record<string, unknown>;
  /** close-sync 가 이미 계산한 [심볼, 수량, 평단, 가격]. */
  evalRows: [string, number, number, number][];
  /** 증권사가 준 총 평가금. >0 이면 evalRows 의 가격 자리가 **평단**이라 스케일이 필요하다. */
  hvBroker: number;
}): BlockSnapshot | null {
  const symbols = symbolsOf(args.strategy, args.config);
  if (!symbols) return null;

  const 내것 = new Set(symbols);
  const 값 = (r: [string, number, number, number]) => r[1] * r[3];
  let holdingsValue = args.evalRows.filter((r) => 내것.has(r[0])).reduce((s, r) => s + 값(r), 0);

  // 증권사 총평가금을 쓴 분기에서는 가격 자리가 평단이라 블록 값이 **원가**가 된다.
  // 총합이 맞도록 비율로 늘려 근사한다(정확한 종목별 시가는 알 수 없다).
  if (args.hvBroker > 0) {
    const 원가합 = args.evalRows.reduce((s, r) => s + 값(r), 0);
    if (원가합 > 0) holdingsValue *= args.hvBroker / 원가합;
  }

  const cash = ledgerCash(args.strategy, args.state);
  return {
    cash,
    holdingsValue,
    totalValue: (cash ?? 0) + holdingsValue,
    symbols,
  };
}
