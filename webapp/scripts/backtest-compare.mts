// 전략 비교 백테스트 러너 (일회성 분석 도구) — pnpm dlx tsx scripts/backtest-compare.mts <barsDir>
// 사이트 백테스트와 동일한 lib 코드를 그대로 돌려 buy&hold 대비 수익률·MDD·매매수를 비교한다.
// 포트폴리오 가치 = 현금 + 보유평가 로 재구성해 MDD 를 계산한다(전량 진입/청산 전략 가정).

import { readFileSync } from "node:fs";
import { runTrendBacktest, runTrendVariantBacktest } from "../src/lib/backtest/trend-engine";
import { generateV2, generateV3, generateV4 } from "../src/lib/backtest/trend-variants";
import { generateRegimeV1 } from "../src/lib/backtest/regime";
import type { Bar, BacktestResult } from "../src/lib/backtest/types";

const dir = process.argv[2];
if (!dir) throw new Error("usage: tsx backtest-compare.mts <barsDir>");
const P = 10000;

const loadBars = (t: string): Bar[] => JSON.parse(readFileSync(`${dir}/bars-${t}.json`, "utf-8"));
const slice = (bars: Bar[], from?: string, to?: string) =>
  bars.filter((b) => (!from || b.date >= from) && (!to || b.date <= to));

/** 포트폴리오 가치 곡선(현금+보유) 재구성 → 수익률·MDD. 전량 진입/청산 전략 전제. */
function evaluate(bars: Bar[], r: BacktestResult) {
  let cash = P;
  let qty = 0;
  let i = 0;
  let maxV = -Infinity;
  let mdd = 0;
  let finalV = P;
  const byDate = new Map<string, { side: string; qty: number; price: number }[]>();
  for (const t of r.trades) {
    if (!byDate.has(t.date)) byDate.set(t.date, []);
    byDate.get(t.date)!.push(t);
  }
  for (const b of bars) {
    for (const t of byDate.get(b.date) ?? []) {
      if (t.side === "buy") { cash -= t.qty * t.price; qty += t.qty; }
      else { cash += t.qty * t.price; qty -= t.qty; if (qty < 0) qty = 0; }
    }
    const v = cash + qty * b.close;
    maxV = Math.max(maxV, v);
    mdd = Math.min(mdd, v / maxV - 1);
    finalV = v;
    i++;
  }
  return { retPct: (finalV / P - 1) * 100, mddPct: mdd * 100, trades: r.trades.length };
}

function buyHold(bars: Bar[]) {
  const q = Math.floor(P / bars[0].close);
  const cash = P - q * bars[0].close;
  let maxV = -Infinity;
  let mdd = 0;
  for (const b of bars) {
    const v = cash + q * b.close;
    maxV = Math.max(maxV, v);
    mdd = Math.min(mdd, v / maxV - 1);
  }
  const finalV = cash + q * bars[bars.length - 1].close;
  return { retPct: (finalV / P - 1) * 100, mddPct: mdd * 100, trades: 1 };
}

const strategies: [string, (bars: Bar[]) => BacktestResult][] = [
  ["trend_v1 (20/60크로스)", (b) => runTrendBacktest(b, { principal: P, shortMa: 20, longMa: 60 })],
  ["trend_v2 (20MA돌파)", (b) => runTrendVariantBacktest(b, 21, (s) => generateV2(s, { principal: P, maPeriod: 20 }))],
  ["trend_v3 (추세필터)", (b) => runTrendVariantBacktest(b, 66, (s) => generateV3(s, { principal: P, shortMa: 20, longMa: 60, slopeDays: 5 }))],
  ["trend_v4 (트레일링30%)", (b) => runTrendVariantBacktest(b, 61, (s) => generateV4(s, { principal: P, shortMa: 20, longMa: 60, trailPct: 0.3 }))],
  ["regime_v1 (200SMA+모멘텀)", (b) => runTrendVariantBacktest(b, 200, (s) => generateRegimeV1(s, { principal: P, smaPeriod: 200, bandPct: 0.02, momDays: 60, trailPct: 0.25 }))],
];

const scenarios: [string, string, string?, string?][] = [
  ["QQQ 전체(1999~2026, 닷컴+금융위기+2022 포함)", "QQQ"],
  ["TQQQ 전체(2010~2026)", "TQQQ"],
  ["SPY 전체(1999~2026)", "SPY"],
  ["QQQ 닷컴버블(2000-01~2002-12)", "QQQ", "2000-01-01", "2002-12-31"],
  ["QQQ 금융위기(2007-10~2009-03)", "QQQ", "2007-10-01", "2009-03-31"],
  ["QQQ 2022 하락장(2022-01~2022-12)", "QQQ", "2022-01-01", "2022-12-31"],
  ["TQQQ 2020~2026(코로나 급락+강세)", "TQQQ", "2020-01-01"],
];

for (const [label, ticker, from, to] of scenarios) {
  const bars = slice(loadBars(ticker), from, to);
  if (bars.length < 210) { console.log(`\n## ${label} — 데이터 부족(${bars.length})`); continue; }
  console.log(`\n## ${label} — ${bars.length}일 (${bars[0].date}~${bars[bars.length - 1].date})`);
  const bh = buyHold(bars);
  console.log(`  ${"buy&hold".padEnd(28)} 수익률 ${bh.retPct.toFixed(1).padStart(8)}% | MDD ${bh.mddPct.toFixed(1).padStart(7)}% | 매매 ${bh.trades}`);
  for (const [name, run] of strategies) {
    const e = evaluate(bars, run(bars));
    console.log(`  ${name.padEnd(28)} 수익률 ${e.retPct.toFixed(1).padStart(8)}% | MDD ${e.mddPct.toFixed(1).padStart(7)}% | 매매 ${e.trades}`);
  }
}

// ── 파라미터 스윕: TQQQ 레짐 튜닝 + 시장(QQQ) 기준선 ─────────────────────
console.log("\n\n===== 스윕: TQQQ 레짐 모멘텀 튜닝 (시장 기준선 = QQQ buy&hold) =====");
const qqq = loadBars("QQQ");
const tqqq = loadBars("TQQQ");
for (const from of ["2010-02-11", "2020-01-01"]) {
  const qb = buyHold(slice(qqq, from));
  console.log(`\n[${from}~] 시장(QQQ B&H): 수익률 ${qb.retPct.toFixed(1)}% | MDD ${qb.mddPct.toFixed(1)}%`);
  const tb = slice(tqqq, from);
  for (const trail of [0.25, 0.35, 0.45, 0.99]) {
    for (const mom of [60, 90]) {
      const e = evaluate(tb, runTrendVariantBacktest(tb, 200, (s) =>
        generateRegimeV1(s, { principal: P, smaPeriod: 200, bandPct: 0.02, momDays: mom, trailPct: trail })));
      console.log(`  TQQQ regime(trail=${(trail * 100).toFixed(0)}%,mom=${mom})  수익률 ${e.retPct.toFixed(1).padStart(8)}% | MDD ${e.mddPct.toFixed(1).padStart(7)}% | 매매 ${e.trades}`);
    }
  }
  for (const p of [20, 50, 100]) {
    const e = evaluate(tb, runTrendVariantBacktest(tb, p + 1, (s) => generateV2(s, { principal: P, maPeriod: p })));
    console.log(`  TQQQ v2(MA=${String(p).padEnd(3)})            수익률 ${e.retPct.toFixed(1).padStart(8)}% | MDD ${e.mddPct.toFixed(1).padStart(7)}% | 매매 ${e.trades}`);
  }
}

// ── LRS (Leverage Rotation, Gayed 2016): 시그널=QQQ 200SMA, 매매=TQQQ ────
console.log("\n\n===== LRS: QQQ 200SMA 시그널로 TQQQ 매매 (vs QQQ/TQQQ B&H) =====");
function runLrs(tradeBars: Bar[], signalBars: Bar[], smaP: number, band: number, trail: number) {
  const sig = new Map(signalBars.map((b) => [b.date, b.close]));
  const sigCloses: number[] = []; // 시간순 시그널 종가
  let cash = P; let qty = 0; let peak = 0; let maxV = -Infinity; let mdd = 0; let finalV = P; let trades = 0;
  for (const b of tradeBars) {
    const sc = sig.get(b.date);
    if (sc !== undefined) sigCloses.push(sc);
    if (sigCloses.length >= smaP && sc !== undefined) {
      const ma = sigCloses.slice(-smaP).reduce((a, x) => a + x, 0) / smaP;
      if (qty > 0) {
        peak = Math.max(peak, b.close);
        const trailHit = trail > 0 && trail < 1 && b.close <= peak * (1 - trail);
        if (sc < ma * (1 - band) || trailHit) { cash += qty * b.close; qty = 0; peak = 0; trades++; }
      } else if (sc > ma * (1 + band)) {
        qty = Math.floor(cash / b.close); cash -= qty * b.close; peak = b.close; trades++;
      }
    }
    const v = cash + qty * b.close;
    maxV = Math.max(maxV, v); mdd = Math.min(mdd, v / maxV - 1); finalV = v;
  }
  return { retPct: (finalV / P - 1) * 100, mddPct: mdd * 100, trades };
}
for (const from of ["2010-02-11", "2020-01-01"]) {
  const tb = slice(tqqq, from);
  const qWarm = slice(qqq, undefined, undefined); // 전체(워밍업용 — runLrs 가 date 매칭으로 정렬)
  const qb = buyHold(slice(qqq, from));
  const tbh = buyHold(tb);
  console.log(`\n[${from}~] 시장 QQQ B&H ${qb.retPct.toFixed(1)}% (MDD ${qb.mddPct.toFixed(1)}%) | TQQQ B&H ${tbh.retPct.toFixed(1)}% (MDD ${tbh.mddPct.toFixed(1)}%)`);
  for (const band of [0, 0.01, 0.02]) {
    for (const trail of [0, 0.35]) {
      const e = runLrs(tb, qWarm, 200, band, trail);
      console.log(`  LRS(band=${(band * 100).toFixed(0)}%,trail=${trail ? (trail * 100).toFixed(0) + "%" : "무"})  수익률 ${e.retPct.toFixed(1).padStart(9)}% | MDD ${e.mddPct.toFixed(1).padStart(7)}% | 매매 ${e.trades}`);
    }
  }
}
// 방어 검증: QQQ 시그널로 QQQ 매매(1배), 하락장 구간
console.log("\n[방어 검증 — 시그널·매매 모두 QQQ(1배)]");
for (const [label, from, to] of [["닷컴 2000-2002", "2000-01-01", "2002-12-31"], ["금융위기 2007-2009", "2007-10-01", "2009-03-31"], ["2022 하락장", "2022-01-01", "2022-12-31"]] as const) {
  const b = slice(qqq, from, to);
  const bh = buyHold(b);
  const e = runLrs(b, qqq, 200, 0.01, 0);
  console.log(`  ${label}: B&H ${bh.retPct.toFixed(1)}% (MDD ${bh.mddPct.toFixed(1)}%) → LRS ${e.retPct.toFixed(1)}% (MDD ${e.mddPct.toFixed(1)}%)`);
}

// ── 무한매수 버전별 비교 (TQQQ) ────────────────────────────────────────
import { runBacktest } from "../src/lib/backtest/engine";
import { runInfiniteVariantBacktest } from "../src/lib/backtest/infinite-variants";
import { runInfiniteV4Backtest } from "../src/lib/backtest/infinite-v4";
console.log("\n\n===== 무한매수 버전별 (TQQQ, 원금 $10k) =====");
const infStrats: [string, (b: Bar[]) => BacktestResult][] = [
  ["v1   (40분할,+10%,저가터치)", (b) => runBacktest(b, { principal: P, splits: 40, takeProfitPct: 0.10, locPremiumPct: 0.12 })],
  ["v2.1 (40분할)", (b) => runInfiniteVariantBacktest(b, { principal: P, splits: 40, version: "v2_1" })],
  ["v2.2 (40분할)", (b) => runInfiniteVariantBacktest(b, { principal: P, splits: 40, version: "v2_2" })],
  ["v3.0 (20분할)", (b) => runInfiniteVariantBacktest(b, { principal: P, splits: 20, version: "v3_0" })],
  ["v4.0공식 (20분할+리버스)", (b) => runInfiniteV4Backtest(b, { principal: P, splits: 20 })],
  ["v4.0공식 (40분할+리버스)", (b) => runInfiniteV4Backtest(b, { principal: P, splits: 40 })],
];
for (const [label, from, to] of [["TQQQ 전체(2010~2026)", undefined, undefined], ["TQQQ 2021~2023(2022 하락 포함)", "2021-01-01", "2023-12-31"], ["TQQQ 2020~2026", "2020-01-01", undefined]] as const) {
  const b = slice(tqqq, from, to);
  console.log(`\n## ${label} — ${b.length}일`);
  for (const [name, run] of infStrats) {
    const e = evaluate(b, run(b));
    console.log(`  ${name.padEnd(26)} 실현손익 ${e.retPct.toFixed(1).padStart(7)}% | MDD ${e.mddPct.toFixed(1).padStart(7)}% | 매매 ${e.trades}`);
  }
}

// ── 최종 비교: 공식 무한매수 v4.0 vs 레버리지 로테이션(LRS) ──────────────
console.log("\n\n===== 무한매수 v4.0(공식) vs LRS — TQQQ $10k, 포트폴리오 가치 기준 =====");
function lrsAsResult(tb: Bar[], sig: Bar[]): BacktestResult {
  // runLrs 는 자체 평가라, evaluate 와 동일 기준 비교를 위해 lrs.ts 엔진(BacktestResult) 사용
  return runLrsBacktest(tb, sig, { principal: P, smaPeriod: 200, bandPct: 0.01, trailPct: 0 });
}
import { runLrsBacktest } from "../src/lib/backtest/lrs";
for (const [label, from, to] of [["2010~2026 전체", "2010-02-11", undefined], ["2020~2026", "2020-01-01", undefined], ["2021~2023 (2022 하락)", "2021-01-01", "2023-12-31"]] as const) {
  const tb = slice(tqqq, from, to);
  const qb = buyHold(slice(qqq, from, to));
  console.log(`\n## ${label}`);
  console.log(`  ${"시장(QQQ B&H)".padEnd(24)} 수익률 ${qb.retPct.toFixed(1).padStart(9)}% | MDD ${qb.mddPct.toFixed(1).padStart(7)}%`);
  const l = evaluate(tb, lrsAsResult(tb, qqq));
  console.log(`  ${"LRS(QQQ시그널→TQQQ)".padEnd(24)} 수익률 ${l.retPct.toFixed(1).padStart(9)}% | MDD ${l.mddPct.toFixed(1).padStart(7)}% | 매매 ${l.trades}`);
  for (const sp of [20, 40]) {
    const e = evaluate(tb, runInfiniteV4Backtest(tb, { principal: P, splits: sp }));
    console.log(`  ${("무한매수 v4.0(" + sp + "분할)").padEnd(24)} 수익률 ${e.retPct.toFixed(1).padStart(9)}% | MDD ${e.mddPct.toFixed(1).padStart(7)}% | 매매 ${e.trades}`);
  }
}

// ── rotation_v1: 후보 자동 로테이션 vs LRS(TQQQ 고정) ─────────────────────
import { runRotationBacktest } from "../src/lib/backtest/rotation";
import { readFileSync as rfs } from "node:fs";
console.log("\n\n===== rotation_v1(TQQQ/SOXL/UPRO/TECL 자동) vs LRS(TQQQ 고정) =====");
const CAND = ["TQQQ", "SOXL", "UPRO", "TECL"].map((t) => {
  try { return { ticker: t, bars: JSON.parse(rfs(`${dir}/bars-${t}.json`, "utf-8")) as Bar[] }; }
  catch { return null; }
}).filter(Boolean) as { ticker: string; bars: Bar[] }[];
console.log("후보:", CAND.map((c) => c.ticker).join(", "));
for (const [label, from, to] of [["2010~2026", "2010-03-11", undefined], ["2020~2026", "2020-01-01", undefined], ["2021~2023", "2021-01-01", "2023-12-31"]] as const) {
  const tb = slice(tqqq, from, to);
  const l = evaluate(tb, runLrsBacktest(tb, qqq, { principal: P, smaPeriod: 200, bandPct: 0.01, trailPct: 0 }));
  const rot = runRotationBacktest(CAND, qqq, { principal: P, smaPeriod: 200, bandPct: 0.01, momDays: 126, rebalanceDays: 21, from, to });
  // rotation 총자산 곡선으로 자체 평가(다중 종목이라 evaluate 불가)
  let maxV = -Infinity, mdd = 0;
  for (const e of rot.equityCurve) { maxV = Math.max(maxV, e.equity); mdd = Math.min(mdd, e.equity / maxV - 1); }
  const finalV = rot.equityCurve.at(-1)?.equity ?? P;
  console.log(`\n[${label}]`);
  console.log(`  LRS(TQQQ 고정)        수익률 ${l.retPct.toFixed(1).padStart(9)}% | MDD ${l.mddPct.toFixed(1).padStart(7)}% | 매매 ${l.trades}`);
  console.log(`  rotation_v1(자동선택) 수익률 ${((finalV / P - 1) * 100).toFixed(1).padStart(9)}% | MDD ${(mdd * 100).toFixed(1).padStart(7)}% | 매매 ${rot.trades.length}`);
  const held: Record<string, number> = {};
  rot.trades.filter((t) => t.side === "buy").forEach((t) => { held[t.ticker!] = (held[t.ticker!] ?? 0) + 1; });
  console.log(`  └ 진입 종목 분포: ${Object.entries(held).map(([k, v]) => k + "×" + v).join(" · ")}`);
}

// rotation 파라미터 스윕
console.log("\n===== rotation 스윕 (2010~2026, mom×rebalance) =====");
for (const mom of [63, 126, 252]) {
  for (const reb of [21, 63]) {
    const rot = runRotationBacktest(CAND, qqq, { principal: P, smaPeriod: 200, bandPct: 0.01, momDays: mom, rebalanceDays: reb, from: "2010-03-11" });
    let maxV = -Infinity, mdd = 0;
    for (const e of rot.equityCurve) { maxV = Math.max(maxV, e.equity); mdd = Math.min(mdd, e.equity / maxV - 1); }
    const finalV = rot.equityCurve.at(-1)?.equity ?? P;
    console.log(`  mom=${String(mom).padEnd(3)} reb=${String(reb).padEnd(2)} → 수익률 ${((finalV / P - 1) * 100).toFixed(1).padStart(9)}% | MDD ${(mdd * 100).toFixed(1).padStart(7)}% | 매매 ${rot.trades.length}`);
  }
}

// 전체 강건성 그리드 (사이트 '강건성 스캔'과 동일)
console.log("\n===== 강건성 그리드 (2010~2026, 수익률% / MDD%) =====");
const MOMS2 = [42, 63, 84, 126, 189, 252];
const REBS2 = [21, 42, 63, 84, 126];
console.log("mom＼reb   " + REBS2.map((r) => String(r).padStart(10)).join(""));
for (const m of MOMS2) {
  let row = String(m).padStart(4) + "일     ";
  for (const rb of REBS2) {
    const rot = runRotationBacktest(CAND, qqq, { principal: P, smaPeriod: 200, bandPct: 0.01, momDays: m, rebalanceDays: rb, from: "2010-03-11" });
    let maxV = -Infinity, mdd = 0;
    for (const e of rot.equityCurve) { maxV = Math.max(maxV, e.equity); mdd = Math.min(mdd, e.equity / maxV - 1); }
    const finalV = rot.equityCurve.at(-1)?.equity ?? P;
    row += `${((finalV / P - 1) * 100 / 100).toFixed(0).padStart(6)}x/${(mdd * 100).toFixed(0)}%`;
  }
  console.log(row);
}
