// 모멘텀 로테이션 v1 — 듀얼 모멘텀(Gary Antonacci) × 레짐 필터(LRS/Gayed) 결합.
//
//   - 상대 모멘텀: 후보 ETF 들의 최근 momDays 수익률을 비교해 1위 종목만 전액 보유.
//     rebalanceDays(기본 63거래일 ≈ 분기 — 월 1회는 whipsaw 로 열세)마다 1위를 재평가해
//     다르면 교체(같은 날 종가 스위칭).
//   - 절대/레짐: 시그널(1배 지수, 예: QQQ) 종가 < SMA×(1−밴드) 면 전량 현금(매일 검사 — 방어는
//     리밸런스 주기를 기다리지 않는다). 종가 > SMA×(1+밴드) 회복 시 그날 1위로 재진입.
//   - 복리: 매도 대금 전액을 다음 진입에 재투자.
//   - 체결 모델: 스위칭·진입·청산 모두 당일 종가(시장가 근사). 수수료·슬리피지 미반영.
//
// 종목 선택이 규칙에 내장되므로 "어떤 레버리지 ETF 를 살지"를 사람이 고르지 않는다 —
// 후보 풀만 정하면 강한 종목으로 자동 로테이션된다. 지표 워밍업(SMA·모멘텀)은 from 이전
// 데이터로 수행하고 매매는 from~to 구간에서만 한다.

import { rotationDecide } from "@/lib/trading/strategies";
import { DEFAULT_LIQ_DAYS, DEFAULT_POOL_SIZE, liquidityMetric, selectPool } from "./rotation-pool";
import type { BacktestResult, Bar, BtTrade, EquityPoint, RotationV1Config } from "./types";

// 백테스트는 실거래와 **동일한 결정 함수**(rotationDecide, 라이브가 쓰는 그 함수)를 호출한다.
// 백테스트는 풀 자동선발·체결모델(종가)·자산곡선만 담당 — 백테스트=실거래 단일코드.

export interface RotationCandidate {
  ticker: string;
  bars: Bar[]; // 전체 이력(워밍업 포함) — 날짜 오름차순. 자동선발 모드는 volume 포함 권장.
}

export function runRotationBacktest(
  candidates: RotationCandidate[],
  signalBars: Bar[],
  cfg: RotationV1Config,
): BacktestResult {
  const trades: BtTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  const closeMaps = candidates.map((c) => new Map(c.bars.map((b) => [b.date, b.close])));
  const series: number[][] = candidates.map(() => []); // 후보별 시간순 종가 축적(모멘텀용)
  // 후보 자동선발(autoSeed): 거래대금(종가×거래량) 축적 + 현재 풀 (py run_rotation_backtest 동일)
  const autoSeed = cfg.autoSeed;
  const volMaps = autoSeed
    ? candidates.map((c) => new Map(c.bars.map((b) => [b.date, b.volume ?? 0])))
    : [];
  const valSeries: number[][] = candidates.map(() => []);
  const poolLog: string[] = [];
  let pool: Set<string> | null = null;

  let cash = cfg.principal;
  let heldIdx = -1; // 보유 중인 후보 인덱스(-1 = 현금)
  let qty = 0;
  let avg = 0;
  let sinceRebalance = 0;
  const sigCloses: number[] = [];

  const smaLast = (): number | null => {
    if (sigCloses.length < cfg.smaPeriod) return null;
    let s = 0;
    for (let i = sigCloses.length - cfg.smaPeriod; i < sigCloses.length; i++) s += sigCloses[i];
    return s / cfg.smaPeriod;
  };

  const sell = (date: string, price: number) => {
    trades.push({ date, side: "sell", price, qty, pnl: (price - avg) * qty, roundNo: 0,
                  ticker: candidates[heldIdx].ticker });
    cash += price * qty;
    heldIdx = -1;
    qty = 0;
    avg = 0;
  };

  const buy = (date: string, i: number, price: number) => {
    const q = Math.floor(cash / price);
    if (q < 1) return;
    trades.push({ date, side: "buy", price, qty: q, pnl: 0, roundNo: 0, ticker: candidates[i].ticker });
    cash -= price * q;
    heldIdx = i;
    qty = q;
    avg = price;
  };

  for (const bar of signalBars) {
    // 지표 축적(항상 — 매매 구간 밖에서도 워밍업)
    sigCloses.push(bar.close);
    for (let i = 0; i < candidates.length; i++) {
      const c = closeMaps[i].get(bar.date);
      if (c !== undefined) {
        series[i].push(c);
        if (autoSeed) valSeries[i].push(c * (volMaps[i].get(bar.date) ?? 0));
      }
    }
    const inRange = (!cfg.from || bar.date >= cfg.from) && (!cfg.to || bar.date <= cfg.to);
    // 자동선발: 실운영과 같은 시점(풀 미확정·현금 대기·재평가 도래)에 풀 재선발 — 판정 전.
    if (inRange && autoSeed
        && (pool === null || heldIdx < 0 || sinceRebalance >= cfg.rebalanceDays)) {
      const metrics: Record<string, number | null> = {};
      for (let i = 0; i < candidates.length; i++) {
        metrics[candidates[i].ticker] = liquidityMetric(valSeries[i], cfg.liqDays ?? DEFAULT_LIQ_DAYS);
      }
      const newPool = selectPool(autoSeed, metrics, cfg.poolSize ?? DEFAULT_POOL_SIZE);
      // 구성(집합) 변경만 갱신 — 유동성 순위 스왑은 매매 영향 없음(py 백테스트·엔진과 동일 규칙).
      if (pool === null || newPool.length !== pool.size || !newPool.every((t) => pool!.has(t))) {
        poolLog.push(`${bar.date} 후보 ${pool === null ? "선발" : "갱신"}: ${newPool.join(",")}`);
        pool = new Set(newPool);
      }
    }
    const ma = smaLast();
    if (inRange && ma !== null) {
      const heldClose = heldIdx >= 0 ? closeMaps[heldIdx].get(bar.date) : undefined;
      // 재평가 카운터는 "보유 & 레짐 온" 인 날에만 진행(원본과 동일 타이밍) — decide 전에 증가.
      const regimeOn = bar.close > ma * (1 + cfg.bandPct);
      if (regimeOn && heldIdx >= 0) sinceRebalance++;

      // 풀 안에서 오늘 데이터 있는 후보만 candidates 로, 각 후보 종가는 최신순으로 전달.
      const poolCands: string[] = [];
      const candCloses: Record<string, number[]> = {};
      for (let i = 0; i < candidates.length; i++) {
        if (pool && !pool.has(candidates[i].ticker)) continue;
        if (!closeMaps[i].has(bar.date)) continue;
        poolCands.push(candidates[i].ticker);
        candCloses[candidates[i].ticker] = series[i].slice(-(cfg.momDays + 1)).reverse();
      }
      const dec = rotationDecide({
        candidates: poolCands, signalCloses: sigCloses.slice(-cfg.smaPeriod).reverse(),
        candCloses, holding: heldIdx >= 0 ? candidates[heldIdx].ticker : null,
        daysSinceRebalance: sinceRebalance,
        smaPeriod: cfg.smaPeriod, bandPct: cfg.bandPct, momDays: cfg.momDays, rebalanceDays: cfg.rebalanceDays,
      });

      if (dec.action === "cash") {
        if (heldIdx >= 0 && heldClose !== undefined) sell(bar.date, heldClose); // 레짐 오프 청산
      } else if (dec.action === "switch" && dec.target) {
        const ti = candidates.findIndex((c) => c.ticker === dec.target);
        const tp = ti >= 0 ? closeMaps[ti].get(bar.date) : undefined;
        if (tp !== undefined && (heldIdx < 0 || heldClose !== undefined)) {
          if (heldIdx >= 0 && heldClose !== undefined) sell(bar.date, heldClose); // 같은 날 종가 스위칭
          buy(bar.date, ti, tp);
          sinceRebalance = 0;
        }
      } else if (dec.rebalanced) {
        sinceRebalance = 0; // 재평가일 "1위 유지"(교체 없음)도 카운터 리셋
      }
    }
    if (inRange) {
      const heldClose = heldIdx >= 0 ? closeMaps[heldIdx].get(bar.date) : undefined;
      // 총자산(현금+보유) — 로테이션은 레짐 오프 구간이 길어 총자산 곡선이 더 유용하다
      equityCurve.push({ date: bar.date, equity: cash + (heldClose !== undefined ? qty * heldClose : qty * avg) });
    }
  }

  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return { trades, equityCurve, totalPnl, ...(autoSeed ? { poolLog } : {}) };
}
