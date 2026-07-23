// 크로스섹셔널 팩터 백테스트(순수) — 유니버스 다종목을 팩터로 랭킹해 상위/하위 분위를 동일가중
// 매수, 월 리밸런스. 저변동성·크로스섹셔널 모멘텀·단기 평균회귀 3종 + 벤치마크(동일가중·시장ETF).
// 가격(종가)만 사용. long-only·동일가중·거래비용 미반영(v1). 지표는 metrics.computeMetrics 재사용.
//
// ⚠ 생존편향: 입력 유니버스가 '현재' 구성종목이면 상장폐지 종목 제외로 결과가 낙관 편향된다.

import type { EquityPoint } from "./types";
import { computeMetrics, type BacktestMetrics } from "./metrics";

export interface FactorMatrix {
  dates: string[]; // 정렬된 거래일(정합 축) "YYYY-MM-DD"
  closes: Map<string, (number | null)[]>; // ticker -> dates 정렬 종가(결측 null)
}

export interface FactorParams {
  quantile: number; // 상위/하위 분위 비율 (0.2 = 20%)
  volLookback: number; // 저변동성 룩백(거래일)
  momLong: number; // 모멘텀 룩백(거래일, ~12개월)
  momSkip: number; // 모멘텀 최근 제외(거래일, ~1개월)
  revLookback: number; // 평균회귀 룩백(거래일, ~1개월)
  minNames: number; // 분위 선택 최소 종목 수
}

export const DEFAULT_FACTOR_PARAMS: FactorParams = {
  quantile: 0.2,
  volLookback: 252,
  momLong: 252,
  momSkip: 21,
  revLookback: 21,
  minNames: 5,
};

export type FactorKind = "low_vol" | "momentum" | "reversal";

// --- 내부 헬퍼 ---

/** 종가 결측을 직전값으로 전진보간(첫 상장 전은 null 유지). first = 각 종목 첫 유효 인덱스. */
function forwardFilled(
  closes: Map<string, (number | null)[]>,
  n: number,
): { ff: Map<string, (number | null)[]>; first: Map<string, number> } {
  const ff = new Map<string, (number | null)[]>();
  const first = new Map<string, number>();
  for (const [t, arr] of closes) {
    const out: (number | null)[] = new Array(n).fill(null);
    let last: number | null = null;
    let f = -1;
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      if (v != null && Number.isFinite(v) && v > 0) {
        last = v;
        if (f < 0) f = i;
      }
      out[i] = last;
    }
    ff.set(t, out);
    first.set(t, f < 0 ? Infinity : f);
  }
  return { ff, first };
}

/** 각 달의 첫 거래일 인덱스(월 리밸런스일). */
function monthStarts(dates: string[]): number[] {
  const idx: number[] = [];
  let lm = "";
  for (let i = 0; i < dates.length; i++) {
    const m = dates[i].slice(0, 7);
    if (m !== lm) {
      idx.push(i);
      lm = m;
    }
  }
  return idx;
}

/** 리밸런스 시점 ti 에서 팩터 스코어(적격 종목만). */
function scoresAt(
  kind: FactorKind,
  ff: Map<string, (number | null)[]>,
  first: Map<string, number>,
  ti: number,
  p: FactorParams,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [t, arr] of ff) {
    const f = first.get(t) ?? Infinity;
    if (kind === "low_vol") {
      if (f > ti - p.volLookback) continue; // 충분한 이력 없음
      let sum = 0;
      let sum2 = 0;
      let cnt = 0;
      let prev = arr[ti - p.volLookback];
      for (let i = ti - p.volLookback + 1; i <= ti; i++) {
        const c = arr[i];
        if (c != null && prev != null && prev > 0) {
          const r = c / prev - 1;
          sum += r;
          sum2 += r * r;
          cnt++;
        }
        prev = c;
      }
      if (cnt < p.volLookback / 2) continue;
      const mean = sum / cnt;
      out.set(t, Math.sqrt(Math.max(sum2 / cnt - mean * mean, 0)));
    } else if (kind === "momentum") {
      if (f > ti - p.momLong) continue;
      const a = arr[ti - p.momLong];
      const b = arr[ti - p.momSkip];
      if (a == null || b == null || a <= 0) continue;
      out.set(t, b / a - 1);
    } else {
      // reversal
      if (f > ti - p.revLookback) continue;
      const a = arr[ti - p.revLookback];
      const b = arr[ti];
      if (a == null || b == null || a <= 0) continue;
      out.set(t, b / a - 1);
    }
  }
  return out;
}

/** 스코어를 정렬해 분위 선택. pickLowest=true 면 낮은 쪽(저변동·최근하락), false 면 높은 쪽(모멘텀). */
function select(scores: Map<string, number>, pickLowest: boolean, q: number, minNames: number): string[] {
  const arr = [...scores.entries()].sort((x, y) => (pickLowest ? x[1] - y[1] : y[1] - x[1]));
  if (arr.length === 0) return [];
  const k = Math.min(arr.length, Math.max(minNames, Math.floor(arr.length * q)));
  return arr.slice(0, k).map((e) => e[0]);
}

/** 시뮬레이션 옵션 — 원금·월적립금·투자 창(인덱스). 기본은 시작=1·목돈·전체 범위(기존 호환). */
export interface SimOpts {
  principal: number; // 초기 원금(현금). 기본 1(= 시작=1 정규화).
  contribution: number; // 매월 리밸런스일 적립액. 0=목돈.
  startIdx: number; // 투자 시작 인덱스(이전은 곡선 미출력, 스코어 룩백엔 계속 사용).
  endIdx: number; // 투자 종료 인덱스(포함).
}

/** dates.length 로 기본 옵션(시작=1·목돈·전체 범위). */
function defaultOpts(n: number): SimOpts {
  return { principal: 1, contribution: 0, startIdx: 0, endIdx: n - 1 };
}

/** 창 [startIdx,endIdx] 내 '월초' 리밸런스 인덱스 중 startIdx 이후(적립 유입 시점 = 첫 배치 제외). */
function monthlyRebalances(dates: string[], startIdx: number, endIdx: number): number[] {
  return monthStarts(dates).filter((i) => i > startIdx && i <= endIdx);
}

/**
 * 포지션 가치 추적으로 일별 equity(금액) 곡선 산출. 선택 종목 동일가중, 월 리밸런스, 사이 드리프트 허용.
 * startIdx 에서 원금을 즉시 배치(초기 리밸런스)하고, 이후 월초에 contribution 을 유입(적립식). 곡선은
 * [startIdx,endIdx] 만. 스코어(selectAt)는 startIdx 이전 데이터를 룩백으로 계속 참조한다(호출측 ff 전체).
 */
function simulate(dates: string[], ff: Map<string, (number | null)[]>, selectAt: (ti: number) => string[], opts: SimOpts): EquityPoint[] {
  const { principal, contribution, startIdx, endIdx } = opts;
  const contribAt = new Set(monthlyRebalances(dates, startIdx, endIdx)); // 적립 유입일
  const rebalAt = new Set<number>([startIdx, ...contribAt]); // 초기 배치 + 월초
  let equity = principal;
  let positions: { t: string; shares: number }[] = [];
  const curve: EquityPoint[] = [];
  for (let ti = startIdx; ti <= endIdx; ti++) {
    if (positions.length) {
      let val = 0;
      for (const p of positions) {
        const px = ff.get(p.t)![ti];
        if (px != null) val += p.shares * px;
      }
      if (val > 0) equity = val;
    }
    if (contribution > 0 && contribAt.has(ti)) equity += contribution; // 월 적립 유입(재배치 전)
    if (rebalAt.has(ti)) {
      const sel = selectAt(ti);
      if (sel.length) {
        const per = equity / sel.length;
        positions = [];
        for (const t of sel) {
          const px = ff.get(t)![ti];
          if (px != null && px > 0) positions.push({ t, shares: per / px });
        }
      }
    }
    curve.push({ date: dates[ti], equity });
  }
  return curve;
}

// --- 공개 API ---

/** 팩터 전략 1종의 equity 곡선. opts 미지정 시 시작=1·목돈·전체 범위(기존 호환). */
export function runFactor(matrix: FactorMatrix, kind: FactorKind, params: FactorParams = DEFAULT_FACTOR_PARAMS, opts?: Partial<SimOpts>): EquityPoint[] {
  const o = { ...defaultOpts(matrix.dates.length), ...opts };
  const { ff, first } = forwardFilled(matrix.closes, matrix.dates.length);
  const pickLowest = kind !== "momentum";
  const selectAt = (ti: number) => select(scoresAt(kind, ff, first, ti, params), pickLowest, params.quantile, params.minNames);
  return simulate(matrix.dates, ff, selectAt, o);
}

/** 리밸런스 시점 ti 에서 선택되는 종목명(테스트/디버그용). */
export function selectNames(matrix: FactorMatrix, kind: FactorKind, ti: number, params: FactorParams = DEFAULT_FACTOR_PARAMS): string[] {
  const { ff, first } = forwardFilled(matrix.closes, matrix.dates.length);
  return select(scoresAt(kind, ff, first, ti, params), kind !== "momentum", params.quantile, params.minNames);
}

/** 벤치마크: 상장된 모든 종목 동일가중(월 리밸런스). opts 미지정 시 시작=1·목돈·전체 범위. */
export function runEqualWeight(matrix: FactorMatrix, opts?: Partial<SimOpts>): EquityPoint[] {
  const o = { ...defaultOpts(matrix.dates.length), ...opts };
  const { ff, first } = forwardFilled(matrix.closes, matrix.dates.length);
  const selectAt = (ti: number) => [...first.entries()].filter(([, f]) => f <= ti).map(([t]) => t);
  return simulate(matrix.dates, ff, selectAt, o);
}

/** 벤치마크: 단일 종목(시장 ETF) 매수후보유(적립식이면 월 매수). opts 미지정 시 시작=1·목돈. */
export function runBuyHold(matrix: FactorMatrix, ticker: string, opts?: Partial<SimOpts>): EquityPoint[] {
  const o = { ...defaultOpts(matrix.dates.length), ...opts };
  const { ff, first } = forwardFilled(matrix.closes, matrix.dates.length);
  const f = first.get(ticker) ?? Infinity;
  const selectAt = (ti: number) => (f <= ti ? [ticker] : []);
  return simulate(matrix.dates, ff, selectAt, o);
}

/** [from,to] 로 잘라 시작=1 로 재기준(룩백 버퍼 제거·비교 정렬). */
export function trimAndRebase(curve: EquityPoint[], from: string, to: string): EquityPoint[] {
  const win = curve.filter((p) => p.date >= from && p.date <= to);
  if (!win.length) return [];
  const base = win[0].equity || 1;
  return win.map((p) => ({ date: p.date, equity: p.equity / base }));
}

export interface FactorComparisonRow {
  key: string; // low_vol | momentum | reversal | equal_weight | market
  name: string; // 표시명
  metrics: BacktestMetrics;
  equityCurve: EquityPoint[]; // [from,to] 재기준
}

/**
 * 3팩터 + 벤치마크(동일가중·시장ETF)를 같은 기간·같은 원금/적립으로 실행·비교.
 * matrix 는 [from 이전 룩백 버퍼 ~ to] 를 담고, 곡선은 [from,to] 창만 출력(스코어는 버퍼를 룩백으로 참조).
 * principal(기본 1)·contribution(기본 0, 월 적립) 을 주면 실제 금액·적립식 곡선 + TWR 지표를 낸다.
 */
export function runFactorComparison(
  matrix: FactorMatrix,
  opts: { from: string; to: string; marketTicker?: string; params?: FactorParams; principal?: number; contribution?: number },
): FactorComparisonRow[] {
  const params = opts.params ?? DEFAULT_FACTOR_PARAMS;
  const principal = opts.principal ?? 1;
  const contribution = opts.contribution && opts.contribution > 0 ? opts.contribution : 0;
  const dates = matrix.dates;

  // 투자 창: from 이상 첫 인덱스 ~ to 이하 마지막 인덱스.
  let startIdx = dates.findIndex((d) => d >= opts.from);
  if (startIdx < 0) startIdx = 0;
  let endIdx = dates.length - 1;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] <= opts.to) { endIdx = i; break; }
  }
  if (endIdx < startIdx) endIdx = startIdx;
  const sim: SimOpts = { principal, contribution, startIdx, endIdx };

  // 적립 유입 내역(모든 전략 공통 = 창 내 월초, 첫 배치 제외) → TWR 지표에 사용.
  const contribList = contribution > 0 ? monthlyRebalances(dates, startIdx, endIdx).map((i) => ({ date: dates[i], amount: contribution })) : undefined;

  const rows: FactorComparisonRow[] = [];
  const add = (key: string, name: string, curve: EquityPoint[]) => {
    rows.push({ key, name, equityCurve: curve, metrics: computeMetrics(curve, principal, contribList) });
  };
  add("low_vol", "저변동성", runFactor(matrix, "low_vol", params, sim));
  add("momentum", "모멘텀(12-1)", runFactor(matrix, "momentum", params, sim));
  add("reversal", "단기 평균회귀", runFactor(matrix, "reversal", params, sim));
  add("equal_weight", "동일가중(벤치)", runEqualWeight(matrix, sim));
  if (opts.marketTicker && matrix.closes.has(opts.marketTicker)) {
    add("market", `시장ETF(${opts.marketTicker})`, runBuyHold(matrix, opts.marketTicker, sim));
  }
  return rows;
}
