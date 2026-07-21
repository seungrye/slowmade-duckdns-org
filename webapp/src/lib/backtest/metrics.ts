// 백테스트 성과 지표 — equityCurve(총자산/평가 시계열)에서 순수 계산.
// site/파이썬 어디에도 CAGR/Sharpe/Calmar 계산이 없어 신설(현재 클라이언트는 MDD·누적수익률만 인라인).
// 전략 비교(예: 로테이션 일시금 vs 분할매수)에서 수익·방어·위험조정을 한 번에 대조하기 위한 헬퍼.

import type { EquityPoint } from "./types";

export interface BacktestMetrics {
  final: number; // 최종 자산
  totalReturnPct: number; // 누적수익률 % (적립식이면 TWR, 아니면 최종/원금 − 1)
  cagr: number; // 연평균 복리수익률 % (거래일 252 기준, 적립식이면 TWR 기준)
  mdd: number; // 최대낙폭 % (음수, peak 대비 최저; 적립식이면 TWR 지수 기준)
  calmar: number; // cagr / |mdd| (방어 대비 수익)
  sharpe: number; // 일간수익 기반 연율화 샤프(무위험 0)
  totalContributed?: number; // 적립식: 초기원금 + Σ입금 (수익률 분모와 별개로 참고 표시)
}

const TRADING_DAYS = 252;

/** equityCurve + 원금 → 성과 지표. 곡선이 비면 0 지표. 순수 함수(테스트 가능).
 *
 *  contributions(적립식 입금 내역)를 주면 유입 자본을 수익에서 제거한 **시간가중수익률(TWR)** 로
 *  총수익·CAGR·MDD·Sharpe 를 계산한다(입금으로 늘어난 자산을 '수익'으로 오인하지 않도록). 지수는
 *  1 에서 시작해 일별 순수익률 (1+r_i) 를 누적곱하며, 입금일의 수익률은 equity_i/(equity_{i-1}+flow_i)−1.
 *  contributions 미지정/빈배열이면 기존(목돈 단일 투입) 계산과 동일. */
export function computeMetrics(
  equityCurve: EquityPoint[],
  principal: number,
  contributions?: { date: string; amount: number }[],
): BacktestMetrics {
  const n = equityCurve.length;
  if (n === 0 || principal <= 0) {
    return { final: principal, totalReturnPct: 0, cagr: 0, mdd: 0, calmar: 0, sharpe: 0 };
  }
  const final = equityCurve[n - 1].equity;
  const hasContrib = !!contributions && contributions.length > 0;
  const flowByDate = new Map<string, number>();
  if (hasContrib) for (const c of contributions!) flowByDate.set(c.date, (flowByDate.get(c.date) ?? 0) + c.amount);
  const totalContributed = hasContrib
    ? principal + contributions!.reduce((s, c) => s + c.amount, 0)
    : undefined;

  // 일간 순수익률 — 입금일은 유입액을 base 에 더해 수익에서 제외(TWR).
  const rets: number[] = [];
  for (let i = 1; i < n; i++) {
    const flow = hasContrib ? (flowByDate.get(equityCurve[i].date) ?? 0) : 0;
    const base = equityCurve[i - 1].equity + flow;
    if (base > 0) rets.push(equityCurve[i].equity / base - 1);
  }

  // 평가 지수 — 목돈이면 equity 그대로, 적립식이면 1 시작 TWR 누적곱 곡선.
  const idx: number[] = new Array(n);
  if (!hasContrib) {
    for (let i = 0; i < n; i++) idx[i] = equityCurve[i].equity;
  } else {
    idx[0] = 1;
    for (let i = 1; i < n; i++) {
      const flow = flowByDate.get(equityCurve[i].date) ?? 0;
      const base = equityCurve[i - 1].equity + flow;
      idx[i] = idx[i - 1] * (base > 0 ? equityCurve[i].equity / base : 1);
    }
  }
  const idxStart = hasContrib ? 1 : principal;
  const idxEnd = idx[n - 1];

  const totalReturnPct = (idxEnd / idxStart - 1) * 100;

  // MDD — 지수 곡선의 peak 대비 최저 낙폭(%)
  let peak = -Infinity;
  let mddFrac = 0;
  for (const v of idx) {
    if (v > peak) peak = v;
    if (peak > 0) mddFrac = Math.min(mddFrac, v / peak - 1);
  }
  const mdd = mddFrac * 100;

  // CAGR — 거래일 수 → 연수 환산 (지수 기준)
  const years = n / TRADING_DAYS;
  const cagr = years > 0 && idxEnd > 0 ? (Math.pow(idxEnd / idxStart, 1 / years) - 1) * 100 : 0;

  // Sharpe — 일간수익률 평균/표준편차 × √252 (무위험수익 0)
  let sharpe = 0;
  if (rets.length > 1) {
    const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
    const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
    const sd = Math.sqrt(variance);
    sharpe = sd > 0 ? (mean / sd) * Math.sqrt(TRADING_DAYS) : 0;
  }

  const calmar = mdd < 0 ? cagr / Math.abs(mdd) : 0;
  return { final, totalReturnPct, cagr, mdd, calmar, sharpe, ...(totalContributed !== undefined ? { totalContributed } : {}) };
}
