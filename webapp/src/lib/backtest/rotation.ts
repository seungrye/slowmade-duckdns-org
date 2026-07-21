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
  // 분할매수(DCA) 상태 — dcaSlices>1 일 때만 사용. 진입/교체 후 남은 슬라이스를 매일 소진.
  const dcaSlices = cfg.dcaSlices && cfg.dcaSlices > 1 ? Math.floor(cfg.dcaSlices) : 0;
  let dcaTarget = -1; // 분할매수 중인 후보 인덱스
  let dcaLeft = 0; // 남은 슬라이스 수
  let sliceCash = 0; // 슬라이스당 투입 현금(cash/dcaSlices, 진입 시점 고정)
  // 적립식(매월 입금) — 월경계마다 현금 유입, 보유·레짐온이면 당일 종가로 즉시 추가매수.
  const contribution = cfg.contribution && cfg.contribution > 0 ? cfg.contribution : 0;
  const contributions: { date: string; amount: number }[] = [];
  let prevMonth: string | null = null;

  const smaLast = (): number | null => {
    if (sigCloses.length < cfg.smaPeriod) return null;
    let s = 0;
    for (let i = sigCloses.length - cfg.smaPeriod; i < sigCloses.length; i++) s += sigCloses[i];
    return s / cfg.smaPeriod;
  };

  const fee = cfg.feeRate && cfg.feeRate > 0 ? cfg.feeRate : 0; // 편도 거래비용(수수료+슬리피지)

  const sell = (date: string, price: number) => {
    trades.push({ date, side: "sell", price, qty, pnl: (price - avg) * qty, roundNo: 0,
                  ticker: candidates[heldIdx].ticker });
    cash += price * qty * (1 - fee);
    heldIdx = -1;
    qty = 0;
    avg = 0;
  };

  const buy = (date: string, i: number, price: number) => {
    const q = Math.floor(cash / (price * (1 + fee)));
    if (q < 1) return;
    trades.push({ date, side: "buy", price, qty: q, pnl: 0, roundNo: 0, ticker: candidates[i].ticker });
    cash -= price * q * (1 + fee);
    heldIdx = i;
    qty = q;
    avg = price;
  };

  // 분할매수용 누적 매수 — budget(슬라이스 현금) 안에서 사고 평단을 누적 평균으로 갱신.
  const addBuy = (date: string, i: number, price: number, budget: number): boolean => {
    const q = Math.floor(budget / (price * (1 + fee)));
    if (q < 1) return false;
    trades.push({ date, side: "buy", price, qty: q, pnl: 0, roundNo: 0, ticker: candidates[i].ticker });
    avg = qty > 0 ? (avg * qty + price * q) / (qty + q) : price;
    cash -= price * q * (1 + fee);
    qty += q;
    heldIdx = i;
    return true;
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
    // 적립식: 매매 구간 안에서 월이 바뀌면 입금(첫 in-range 달은 초기원금이라 제외).
    if (inRange && contribution > 0) {
      const ym = bar.date.slice(0, 7);
      if (prevMonth !== null && ym !== prevMonth) {
        cash += contribution;
        contributions.push({ date: bar.date, amount: contribution });
      }
      prevMonth = ym;
    }
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
        // 복합 모멘텀이면 최대 룩백만큼, 아니면 momDays 만큼 최신 종가 전달.
        const need = cfg.momLookbacks && cfg.momLookbacks.length ? Math.max(...cfg.momLookbacks) : cfg.momDays;
        candCloses[candidates[i].ticker] = series[i].slice(-(need + 1)).reverse();
      }
      const dec = rotationDecide({
        candidates: poolCands, signalCloses: sigCloses.slice(-cfg.smaPeriod).reverse(),
        candCloses, holding: heldIdx >= 0 ? candidates[heldIdx].ticker : null,
        daysSinceRebalance: sinceRebalance, momLookbacks: cfg.momLookbacks,
        smaPeriod: cfg.smaPeriod, bandPct: cfg.bandPct, momDays: cfg.momDays, rebalanceDays: cfg.rebalanceDays,
      });

      if (dec.action === "cash") {
        if (heldIdx >= 0 && heldClose !== undefined) sell(bar.date, heldClose); // 레짐 오프 청산
        dcaLeft = 0; // 청산 시 남은 분할매수 계획 취소
      } else if (dec.action === "switch" && dec.target) {
        const ti = candidates.findIndex((c) => c.ticker === dec.target);
        const tp = ti >= 0 ? closeMaps[ti].get(bar.date) : undefined;
        if (tp !== undefined && (heldIdx < 0 || heldClose !== undefined)) {
          if (heldIdx >= 0 && heldClose !== undefined) sell(bar.date, heldClose); // 같은 날 종가 스위칭
          if (dcaSlices) {
            // 분할매수 예약 — 매도 후 가용현금을 dcaSlices 로 나눠 첫 슬라이스만 오늘 매수.
            dcaTarget = ti;
            sliceCash = cash / dcaSlices;
            dcaLeft = dcaSlices;
            if (addBuy(bar.date, ti, tp, sliceCash)) dcaLeft--;
          } else {
            buy(bar.date, ti, tp); // 일시금(기존)
          }
          sinceRebalance = 0;
        }
      } else {
        // hold(재평가 유지 포함) — 분할매수 진행 중이면 오늘 슬라이스 소진.
        if (dcaLeft > 0 && heldIdx === dcaTarget && regimeOn && heldClose !== undefined) {
          if (addBuy(bar.date, dcaTarget, heldClose, sliceCash)) dcaLeft--;
        } else if (contribution > 0 && heldIdx >= 0 && regimeOn && heldClose !== undefined) {
          // 적립금·유휴현금 즉시 투입(현금 드래그 제거) — 보유·레짐온일 때만. 현금 0 이면 no-op.
          addBuy(bar.date, heldIdx, heldClose, cash);
        }
        if (dec.rebalanced) sinceRebalance = 0; // 재평가일 "1위 유지"(교체 없음)도 카운터 리셋
      }
    }
    if (inRange) {
      const heldClose = heldIdx >= 0 ? closeMaps[heldIdx].get(bar.date) : undefined;
      // 총자산(현금+보유) — 로테이션은 레짐 오프 구간이 길어 총자산 곡선이 더 유용하다
      equityCurve.push({ date: bar.date, equity: cash + (heldClose !== undefined ? qty * heldClose : qty * avg) });
    }
  }

  const totalPnl = trades.filter((t) => t.side === "sell").reduce((s, t) => s + t.pnl, 0);
  return {
    trades, equityCurve, totalPnl,
    ...(autoSeed ? { poolLog } : {}),
    ...(contribution > 0
      ? { contributions, totalContributed: cfg.principal + contributions.reduce((s, c) => s + c.amount, 0) }
      : {}),
  };
}
