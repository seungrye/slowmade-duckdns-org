// 백테스트 성과 지표 — equityCurve(총자산/평가 시계열)에서 순수 계산.
// site/파이썬 어디에도 CAGR/Sharpe/Calmar 계산이 없어 신설(현재 클라이언트는 MDD·누적수익률만 인라인).
// 전략 비교(예: 로테이션 일시금 vs 분할매수)에서 수익·방어·위험조정을 한 번에 대조하기 위한 헬퍼.

import type { EquityPoint } from "./types";

export interface BacktestMetrics {
  final: number; // 최종 자산
  totalReturnPct: number; // 누적수익률 % (최종/원금 − 1)
  cagr: number; // 연평균 복리수익률 % (거래일 252 기준)
  mdd: number; // 최대낙폭 % (음수, peak 대비 최저)
  calmar: number; // cagr / |mdd| (방어 대비 수익)
  sharpe: number; // 일간수익 기반 연율화 샤프(무위험 0)
}

const TRADING_DAYS = 252;

/** equityCurve + 원금 → 성과 지표. 곡선이 비면 0 지표. 순수 함수(테스트 가능). */
export function computeMetrics(equityCurve: EquityPoint[], principal: number): BacktestMetrics {
  const n = equityCurve.length;
  if (n === 0 || principal <= 0) {
    return { final: principal, totalReturnPct: 0, cagr: 0, mdd: 0, calmar: 0, sharpe: 0 };
  }
  const final = equityCurve[n - 1].equity;
  const totalReturnPct = (final / principal - 1) * 100;

  // MDD — peak 대비 최저 낙폭(%)
  let peak = -Infinity;
  let mddFrac = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    if (peak > 0) mddFrac = Math.min(mddFrac, p.equity / peak - 1);
  }
  const mdd = mddFrac * 100;

  // CAGR — 거래일 수 → 연수 환산
  const years = n / TRADING_DAYS;
  const cagr = years > 0 && final > 0 ? (Math.pow(final / principal, 1 / years) - 1) * 100 : 0;

  // Sharpe — 일간수익률 평균/표준편차 × √252 (무위험수익 0)
  const rets: number[] = [];
  for (let i = 1; i < n; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev > 0) rets.push(equityCurve[i].equity / prev - 1);
  }
  let sharpe = 0;
  if (rets.length > 1) {
    const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
    const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
    const sd = Math.sqrt(variance);
    sharpe = sd > 0 ? (mean / sd) * Math.sqrt(TRADING_DAYS) : 0;
  }

  const calmar = mdd < 0 ? cagr / Math.abs(mdd) : 0;
  return { final, totalReturnPct, cagr, mdd, calmar, sharpe };
}
