"use client";

import { useState } from "react";
import ReactECharts from "echarts-for-react";
import { useDragScrollX } from "@/hooks/use-drag-scroll";
import type { EChartsOption } from "echarts";
import { runBacktest } from "@/lib/backtest/engine";
import { runTrendBacktest, runTrendVariantBacktest } from "@/lib/backtest/trend-engine";
import { generateV2, generateV3, generateV4 } from "@/lib/backtest/trend-variants";
import { generateRegimeV1 } from "@/lib/backtest/regime";
import { runLrsBacktest } from "@/lib/backtest/lrs";
import { runInfiniteVariantBacktest, type InfiniteVariantVersion } from "@/lib/backtest/infinite-variants";
import { runInfiniteV4Backtest } from "@/lib/backtest/infinite-v4";
import { runRotationBacktest } from "@/lib/backtest/rotation";
import type { Bar, BacktestResult } from "@/lib/backtest/types";

type Strategy =
  | "infinite_v1" | "infinite_v2_1" | "infinite_v2_2" | "infinite_v3_0" | "infinite_v4_0"
  | "trend_v1" | "trend_v2" | "trend_v3" | "trend_v4" | "regime_v1" | "lrs_v1" | "rotation_v1";

const INFINITE_VARIANT_VER: Partial<Record<Strategy, InfiniteVariantVersion>> = {
  infinite_v2_1: "v2_1", infinite_v2_2: "v2_2", infinite_v3_0: "v3_0",
};
type FullResult = BacktestResult & { bars: Bar[]; principal: number; strategy: Strategy };

const STRATEGY_TABS: readonly (readonly [Strategy, string])[] = [
  ["infinite_v1", "무한매수 v1"],
  ["infinite_v2_1", "무한매수 v2.1"],
  ["infinite_v2_2", "무한매수 v2.2"],
  ["infinite_v3_0", "무한매수 v3.0"],
  ["infinite_v4_0", "무한매수 v4.0"],
  ["trend_v1", "추세추종 v1"],
  ["trend_v2", "추세추종 v2 (MA돌파)"],
  ["trend_v3", "추세추종 v3 (추세필터)"],
  ["trend_v4", "추세추종 v4 (트레일링)"],
  ["regime_v1", "레짐 모멘텀 v1"],
  ["lrs_v1", "레버리지 로테이션 v1"],
  ["rotation_v1", "모멘텀 로테이션 v1"],
];

const STRATEGY_DESC: Record<Strategy, string> = {
  infinite_v1:
    "원금 분할 → 1회차 시장가, 이후 평단·프리미엄 LOC 매수, 평단+익절% 전량 매도. (시장가=종가, 매수 LOC=저가 터치, 매도=고가 터치 근사)",
  infinite_v2_1:
    "전반전(T<분할/2): 평단 LOC + 평단+5% LOC 반반 매수, 매도 25% +5% LOC / 75% +10% 지정가. 후반전: 평단 이하만 매수, 매도 25% +0% LOC / 25% +5% / 50% +10%. (RSI 진입·쿼터손절 미구현, LOC=종가 체결)",
  infinite_v2_2:
    "2023 오피셜. 별%=(10−T/2, 40분할 기준)로 전반전 평단+별% LOC 반반, 후반전 별%(평단 아래) 전량 매수. 매도 25% 별% LOC(쿼터) + 75% +10% 지정가. (쿼터손절 모드 미구현, LOC=종가 체결)",
  infinite_v3_0:
    "20분할 기본, 별%=(15−1.5T). 전반전 별%+평단 LOC 반반, 후반전 별% 전량 매수. 매도 25% 별% LOC + 75% +15% 지정가. (쿼터모드·수익 복리 리셋 미구현, LOC=종가 체결)",
  infinite_v4_0:
    "공식 원문(라오어 카페 V4.0 방법론) 대조 구현. 별%=(15−30T/분할), 1회매수금=잔금/(분할−T) 동적, T: 쿼터매도×0.75·75%지정가매도×0.25, 급락일 사다리 매수(1회액 소진), 첫 매수는 다음날 전일종가+10% LOC. 소진(T>분할−1) 시 리버스모드: 보유/[분할/2] 등분 매도(첫날 MOC)·잔금/4 쿼터매수·별지점=직전5일 종가평균·평단−15% 회복 시 일반모드 복귀. 사이클 복리.",
  trend_v1: "골든크로스(단기MA>장기MA 전환)에 원금만큼 시장가 진입, 데드크로스에 전량 청산. (시장가=종가)",
  trend_v2: "종가가 기준 MA(기본 20일선)를 상향 돌파하면 진입, MA 아래로 내려오면 전량 청산 — v1보다 빠른 진입/청산(횡보장 잦은 매매 주의).",
  trend_v3: "골든크로스 + 장기MA가 상승 중일 때만 진입(하락장 가짜 골든크로스 필터), 데드크로스에 청산.",
  trend_v4: "골든크로스 진입은 v1과 동일, 청산은 데드크로스 또는 보유 중 고점 대비 -N%(트레일링 스탑) — 급락장 손실 제한.",
  regime_v1:
    "200일선 레짐 필터(±밴드) + 절대 모멘텀: 종가>200SMA+밴드 & 60일 모멘텀 양수면 진입, 200SMA-밴드 이탈 또는 고점 대비 -N%면 현금 대피. 하락장 방어 + 레버리지 ETF(TQQQ)로 상승장 초과수익 의도(Faber SMA 타이밍 + Antonacci 절대 모멘텀).",
  lrs_v1:
    "레버리지 로테이션(Gayed 2016): 1배 지수(시그널, 예: QQQ)의 200SMA±밴드로 레버리지 ETF(대상, 예: TQQQ)를 스위칭 — 지수>SMA+밴드면 보유, 지수<SMA-밴드면 현금. 지수 신호가 3배 ETF 자체 신호보다 빨라 하락장 대피가 신속. 시그널 종목은 전체 이력으로 SMA 워밍업.",
  rotation_v1:
    "듀얼 모멘텀 × 레짐(LRS): 후보 ETF 중 최근 N거래일 수익률 1위만 전액 보유(상대 모멘텀, 월 1회 재평가·자동 교체), 지수<SMA−밴드면 전량 현금(매일 검사). 종목 선택이 규칙에 내장 — 후보 풀만 정하면 강한 종목으로 자동 로테이션. 스위칭=당일 종가, 복리, 수수료 미반영.",
};

export default function BacktestClient() {
  const [strategy, setStrategy] = useState<Strategy>("infinite_v1");
  const tabScroll = useDragScrollX<HTMLDivElement>();
  // 공통
  const [ticker, setTicker] = useState("");
  const [principal, setPrincipal] = useState(4000);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // 무한매수
  const [splits, setSplits] = useState(40);
  const [takeProfitPct, setTakeProfitPct] = useState(10);
  const [locPremiumPct, setLocPremiumPct] = useState(12);
  // 추세추종 v1·v3·v4 공통(MA 크로스) / v2 는 단일 MA
  const [shortMa, setShortMa] = useState(20);
  const [longMa, setLongMa] = useState(60);
  const [maPeriod, setMaPeriod] = useState(20); // v2
  const [slopeDays, setSlopeDays] = useState(5); // v3
  const [trailPct, setTrailPct] = useState(30); // v4 (%)
  // 레짐 모멘텀 v1
  const [regSma, setRegSma] = useState(200);
  const [regBand, setRegBand] = useState(2); // %
  const [regMom, setRegMom] = useState(60);
  const [regTrail, setRegTrail] = useState(25); // %
  // 모멘텀 로테이션 v1
  const [rotCandidates, setRotCandidates] = useState("TQQQ,SOXL,UPRO,TECL");
  const [rotMom, setRotMom] = useState(126);
  const [rotReb, setRotReb] = useState(63);
  // 레버리지 로테이션 v1
  const [lrsSignal, setLrsSignal] = useState("QQQ");
  const [lrsSma, setLrsSma] = useState(200);
  const [lrsBand, setLrsBand] = useState(1); // %
  const [lrsTrail, setLrsTrail] = useState(0); // % (0=미사용)

  const [result, setResult] = useState<FullResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // rotation 강건성 스캔: mom×재평가 그리드 결과 [momDays, rebDays, 수익률%, MDD%]
  const [scan, setScan] = useState<[number, number, number, number][] | null>(null);
  const [scanning, setScanning] = useState(false);

  // rotation 전용 — mom×재평가 그리드를 일괄 백테스트해 파라미터 민감도(강건성)를 본다.
  const runRobustnessScan = async () => {
    const rotList = rotCandidates.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
    if (rotList.length < 2) { setError("후보 종목을 2개 이상 입력하세요."); return; }
    setScanning(true);
    setError(null);
    try {
      const fetchBars = async (t: string): Promise<Bar[]> => {
        const res0 = await fetch(`/api/admin/backtest/prices?ticker=${encodeURIComponent(t)}`);
        if (!res0.ok) throw new Error(`${t} 데이터 조회 실패 (${res0.status})`);
        const b: Bar[] = (await res0.json()).bars ?? [];
        if (b.length === 0) throw new Error(`${t} 일봉 데이터가 없습니다.`);
        return b;
      };
      const sigTicker = (lrsSignal.trim() || "QQQ").toUpperCase();
      const [sigBars, ...candBars] = await Promise.all([fetchBars(sigTicker), ...rotList.map(fetchBars)]);
      const cands = rotList.map((t, i) => ({ ticker: t, bars: candBars[i] }));
      const MOMS = [42, 63, 84, 126, 189, 252];
      const REBS = [21, 42, 63, 84, 126];
      const out: [number, number, number, number][] = [];
      for (const m of MOMS) {
        for (const rb of REBS) {
          const rr = runRotationBacktest(cands, sigBars, {
            principal, smaPeriod: lrsSma, bandPct: lrsBand / 100, momDays: m,
            rebalanceDays: rb, from: from || undefined, to: to || undefined });
          let maxV = -Infinity; let mdd = 0;
          for (const e of rr.equityCurve) { maxV = Math.max(maxV, e.equity); mdd = Math.min(mdd, e.equity / maxV - 1); }
          const finalV = rr.equityCurve.at(-1)?.equity ?? principal;
          out.push([m, rb, (finalV / principal - 1) * 100, mdd * 100]);
        }
      }
      setScan(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  };

  const run = async () => {
    if (strategy !== "rotation_v1" && !ticker.trim()) {
      setError("종목 코드를 입력하세요.");
      return;
    }
    const rotList = rotCandidates.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
    if (strategy === "rotation_v1" && rotList.length < 2) {
      setError("로테이션 후보 종목을 콤마로 2개 이상 입력하세요.");
      return;
    }
    if (["trend_v1", "trend_v3", "trend_v4"].includes(strategy) && shortMa >= longMa) {
      setError("단기 이동평균은 장기보다 작아야 합니다.");
      return;
    }
    if (strategy === "trend_v2" && maPeriod < 2) {
      setError("기준 이동평균은 2 이상이어야 합니다.");
      return;
    }
    if (strategy === "trend_v4" && (trailPct <= 0 || trailPct >= 100)) {
      setError("트레일링 스탑 %는 0~100 사이여야 합니다.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (strategy === "rotation_v1") {
        // 후보 전체 + 시그널을 전체 이력으로 조회(지표 워밍업), 매매 구간은 from/to 로 제한
        const fetchBars = async (t: string): Promise<Bar[]> => {
          const res0 = await fetch(`/api/admin/backtest/prices?ticker=${encodeURIComponent(t)}`);
          if (!res0.ok) throw new Error(`${t} 데이터 조회 실패 (${res0.status})`);
          const b: Bar[] = (await res0.json()).bars ?? [];
          if (b.length === 0) throw new Error(`${t} 일봉 데이터가 없습니다.`);
          return b;
        };
        const sigTicker = (lrsSignal.trim() || "QQQ").toUpperCase();
        const [sigBars, ...candBars] = await Promise.all([fetchBars(sigTicker), ...rotList.map(fetchBars)]);
        const rr = runRotationBacktest(
          rotList.map((t, i) => ({ ticker: t, bars: candBars[i] })), sigBars,
          { principal, smaPeriod: lrsSma, bandPct: lrsBand / 100, momDays: rotMom,
            rebalanceDays: rotReb, from: from || undefined, to: to || undefined });
        const rangeSig = sigBars.filter((b) => (!from || b.date >= from) && (!to || b.date <= to));
        setResult({ ...rr, bars: rangeSig, principal, strategy });
        return;
      }
      const params = new URLSearchParams({ ticker: ticker.trim().toUpperCase() });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/admin/backtest/prices?${params.toString()}`);
      if (!res.ok) throw new Error(`데이터 조회 실패 (${res.status})`);
      const data = await res.json();
      const bars: Bar[] = data.bars ?? [];
      if (bars.length === 0) {
        setError("해당 종목/기간의 일봉 데이터가 없습니다.");
        setResult(null);
        return;
      }
      // LRS: 시그널 종목(기본 QQQ, 비우면 대상 종목) 일봉을 전체 이력으로 별도 조회(SMA 워밍업).
      let signalBars: Bar[] = bars;
      if (strategy === "lrs_v1") {
        const sigTicker = (lrsSignal.trim() || ticker.trim()).toUpperCase();
        const sres = await fetch(`/api/admin/backtest/prices?ticker=${encodeURIComponent(sigTicker)}`);
        if (!sres.ok) throw new Error(`시그널(${sigTicker}) 데이터 조회 실패 (${sres.status})`);
        signalBars = (await sres.json()).bars ?? [];
        if (signalBars.length === 0) throw new Error(`시그널(${sigTicker}) 일봉 데이터가 없습니다.`);
      }
      const variantVer = INFINITE_VARIANT_VER[strategy];
      const r = (() => {
        if (variantVer) return runInfiniteVariantBacktest(bars, { principal, splits, version: variantVer });
        if (strategy === "infinite_v4_0") return runInfiniteV4Backtest(bars, { principal, splits });
        switch (strategy) {
          case "infinite_v1":
            return runBacktest(bars, { principal, splits, takeProfitPct: takeProfitPct / 100, locPremiumPct: locPremiumPct / 100 });
          case "trend_v1":
            return runTrendBacktest(bars, { principal, shortMa, longMa });
          case "trend_v2":
            return runTrendVariantBacktest(bars, maPeriod + 1, (st) => generateV2(st, { principal, maPeriod }));
          case "trend_v3":
            return runTrendVariantBacktest(bars, longMa + slopeDays + 1, (st) => generateV3(st, { principal, shortMa, longMa, slopeDays }));
          case "trend_v4":
            return runTrendVariantBacktest(bars, longMa + 1, (st) => generateV4(st, { principal, shortMa, longMa, trailPct: trailPct / 100 }));
          case "regime_v1":
            return runTrendVariantBacktest(bars, Math.max(regSma, regMom + 1), (st) =>
              generateRegimeV1(st, { principal, smaPeriod: regSma, bandPct: regBand / 100, momDays: regMom, trailPct: regTrail / 100 }));
          case "lrs_v1":
            return runLrsBacktest(bars, signalBars, { principal, smaPeriod: lrsSma, bandPct: lrsBand / 100, trailPct: lrsTrail / 100 });
          default:
            throw new Error(`unknown strategy: ${strategy}`);
        }
      })();
      setResult({ ...r, bars, principal, strategy });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto px-4 py-8 max-w-5xl">
      <h1 className="text-2xl font-bold mb-1">백테스트</h1>
      <p className="text-sm text-gray-500 mb-4">
        과거 일봉으로 전략을 시뮬레이션합니다. 연산은 브라우저에서 실행돼 서버 부담이 없습니다.
      </p>

      {/* 전략 탭 */}
      <div {...tabScroll} className="flex flex-nowrap gap-2 border-b mb-4 overflow-x-auto overflow-y-hidden scrollbar-hide">
        {STRATEGY_TABS.map(([s, label]) => (
          <button
            key={s}
            type="button"
            onClick={() => { setStrategy(s); setResult(null); setError(null); }}
            className={
              "px-4 py-2 text-sm border-b-2 -mb-px transition whitespace-nowrap shrink-0 " +
              (strategy === s ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500 hover:text-gray-700")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400 mb-4">
        {STRATEGY_DESC[strategy]}
        {" 수수료·슬리피지 미반영."}
      </p>

      {/* 옵션 폼 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Field label="종목 코드" hint="예: TQQQ, 069500">
          <input value={ticker} onChange={(e) => setTicker(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="TICKER" className="input" />
        </Field>
        <Field label="원금" hint="배정 자본(국장은 원화)">
          <input type="number" value={principal} onChange={(e) => setPrincipal(Number(e.target.value))} className="input" />
        </Field>

        {strategy === "infinite_v1" && (
          <>
            <Field label="분할 수 (T)" hint="하루예산=원금/T">
              <input type="number" value={splits} min={1} onChange={(e) => setSplits(Number(e.target.value))} className="input" />
            </Field>
            <Field label="익절 %" hint="평단 대비">
              <input type="number" value={takeProfitPct} step={0.5} onChange={(e) => setTakeProfitPct(Number(e.target.value))} className="input" />
            </Field>
            <Field label="LOC 프리미엄 %" hint="현재가 대비 상단">
              <input type="number" value={locPremiumPct} step={0.5} onChange={(e) => setLocPremiumPct(Number(e.target.value))} className="input" />
            </Field>
          </>
        )}
        {(strategy in INFINITE_VARIANT_VER || strategy === "infinite_v4_0") && (
          <Field label="분할 수" hint="v2.x 권장 40 · v3/v4 권장 20 (매수·매도%는 버전 규칙 내장)">
            <input type="number" value={splits} min={2} onChange={(e) => setSplits(Number(e.target.value))} className="input" />
          </Field>
        )}
        {strategy === "trend_v2" && (
          <Field label="기준 이동평균" hint="종가 돌파/이탈 기준(기본 20일)">
            <input type="number" value={maPeriod} min={2} onChange={(e) => setMaPeriod(Number(e.target.value))} className="input" />
          </Field>
        )}
        {["trend_v1", "trend_v3", "trend_v4"].includes(strategy) && (
          <>
            <Field label="단기 이동평균" hint="기본 20일">
              <input type="number" value={shortMa} min={1} onChange={(e) => setShortMa(Number(e.target.value))} className="input" />
            </Field>
            <Field label="장기 이동평균" hint="기본 60일">
              <input type="number" value={longMa} min={2} onChange={(e) => setLongMa(Number(e.target.value))} className="input" />
            </Field>
          </>
        )}
        {strategy === "trend_v3" && (
          <Field label="추세 판정일" hint="장기MA 가 N일 전보다 높아야 진입(기본 5)">
            <input type="number" value={slopeDays} min={1} onChange={(e) => setSlopeDays(Number(e.target.value))} className="input" />
          </Field>
        )}
        {strategy === "trend_v4" && (
          <Field label="트레일링 스탑 %" hint="보유 중 고점 대비 하락 청산(기본 30)">
            <input type="number" value={trailPct} min={1} max={99} step={1} onChange={(e) => setTrailPct(Number(e.target.value))} className="input" />
          </Field>
        )}
        {strategy === "regime_v1" && (
          <>
            <Field label="레짐 SMA" hint="기본 200일">
              <input type="number" value={regSma} min={20} onChange={(e) => setRegSma(Number(e.target.value))} className="input" />
            </Field>
            <Field label="밴드 %" hint="SMA±밴드 히스테리시스(기본 2)">
              <input type="number" value={regBand} min={0} step={0.5} onChange={(e) => setRegBand(Number(e.target.value))} className="input" />
            </Field>
            <Field label="모멘텀 일수" hint="종가 ≥ N일 전 종가(기본 60)">
              <input type="number" value={regMom} min={1} onChange={(e) => setRegMom(Number(e.target.value))} className="input" />
            </Field>
            <Field label="트레일링 스탑 %" hint="고점 대비 하락 청산(기본 25)">
              <input type="number" value={regTrail} min={1} max={99} onChange={(e) => setRegTrail(Number(e.target.value))} className="input" />
            </Field>
          </>
        )}
        {strategy === "rotation_v1" && (
          <>
            <Field label="후보 종목(콤마)" hint="이 중 모멘텀 1위만 보유">
              <input value={rotCandidates} onChange={(e) => setRotCandidates(e.target.value)} className="input" />
            </Field>
            <Field label="시그널 종목" hint="레짐 판단 1배 지수(기본 QQQ)">
              <input value={lrsSignal} onChange={(e) => setLrsSignal(e.target.value)} placeholder="QQQ" className="input" />
            </Field>
            <Field label="시그널 SMA" hint="기본 200일">
              <input type="number" value={lrsSma} min={20} onChange={(e) => setLrsSma(Number(e.target.value))} className="input" />
            </Field>
            <Field label="밴드 %" hint="히스테리시스(기본 1)">
              <input type="number" value={lrsBand} min={0} step={0.5} onChange={(e) => setLrsBand(Number(e.target.value))} className="input" />
            </Field>
            <Field label="모멘텀 일수" hint="수익률 비교 룩백(기본 126≈6개월)">
              <input type="number" value={rotMom} min={5} onChange={(e) => setRotMom(Number(e.target.value))} className="input" />
            </Field>
            <Field label="재평가 주기(일)" hint="1위 재선정 주기(기본 63≈분기, 잦으면 whipsaw)">
              <input type="number" value={rotReb} min={1} onChange={(e) => setRotReb(Number(e.target.value))} className="input" />
            </Field>
          </>
        )}
        {strategy === "lrs_v1" && (
          <>
            <Field label="시그널 종목" hint="1배 지수(예: QQQ). 비우면 대상 종목">
              <input value={lrsSignal} onChange={(e) => setLrsSignal(e.target.value)} placeholder="QQQ" className="input" />
            </Field>
            <Field label="시그널 SMA" hint="기본 200일">
              <input type="number" value={lrsSma} min={20} onChange={(e) => setLrsSma(Number(e.target.value))} className="input" />
            </Field>
            <Field label="밴드 %" hint="히스테리시스(기본 1)">
              <input type="number" value={lrsBand} min={0} step={0.5} onChange={(e) => setLrsBand(Number(e.target.value))} className="input" />
            </Field>
            <Field label="트레일링 %" hint="0=미사용(기본)">
              <input type="number" value={lrsTrail} min={0} max={99} onChange={(e) => setLrsTrail(Number(e.target.value))} className="input" />
            </Field>
          </>
        )}

        <Field label="시작일" hint="비우면 전체">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        </Field>
        <Field label="종료일" hint="비우면 오늘">
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
        </Field>
        <div className="flex flex-col gap-1">
          {/* 다른 Field 의 label 자리를 투명으로 채워 버튼을 input 라인에 정렬 */}
          <span className="text-xs font-medium invisible select-none" aria-hidden="true">실행</span>
          <button onClick={run} disabled={loading} className="w-full py-2 rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition">
            {loading ? "실행 중…" : "백테스트 실행"}
          </button>
        </div>
        {strategy === "rotation_v1" && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium invisible select-none" aria-hidden="true">스캔</span>
            <button onClick={runRobustnessScan} disabled={scanning}
              className="w-full py-2 rounded border border-blue-600 text-blue-600 font-medium hover:bg-blue-50 disabled:opacity-50 transition">
              {scanning ? "스캔 중…" : "강건성 스캔"}
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {scan && strategy === "rotation_v1" && <RobustnessHeatmap scan={scan} curMom={rotMom} curReb={rotReb} />}
      {result && <Result result={result} />}

      <style jsx>{`
        :global(.input) { width: 100%; padding: 0.5rem; border: 1px solid rgb(209 213 219); border-radius: 0.375rem; background: transparent; font-size: 0.875rem; }
        :global(.dark .input) { border-color: rgb(75 85 99); }
      `}</style>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
    </label>
  );
}

/** rotation 강건성 히트맵 — mom×재평가 그리드의 수익률(셀 색)과 MDD.
 *  읽는 법: 넓은 영역이 고르게 진하면(고원) 강건, 한 셀만 진하면(뾰족) 과최적화 의심. */
function RobustnessHeatmap({ scan, curMom, curReb }: { scan: [number, number, number, number][]; curMom: number; curReb: number }) {
  const moms = [...new Set(scan.map(([m]) => m))].sort((a, b) => a - b);
  const rebs = [...new Set(scan.map(([, r]) => r))].sort((a, b) => a - b);
  const maxRet = Math.max(...scan.map(([, , r]) => r), 1);
  const cell = (m: number, rb: number) => scan.find(([a, b]) => a === m && b === rb);
  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold mb-1">강건성 스캔 — 모멘텀(행) × 재평가 주기(열)</h2>
      <p className="text-xs text-gray-400 mb-2">
        셀 = 수익률(위)·MDD(아래). 색이 넓게 고르면(고원) 파라미터에 둔감해 신뢰↑, 한 셀만 진하면 과최적화 의심.
        현재 설정은 테두리 강조.
      </p>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="p-1.5 text-gray-400">mom＼재평가</th>
              {rebs.map((rb) => <th key={rb} className="p-1.5 text-gray-400">{rb}일</th>)}
            </tr>
          </thead>
          <tbody>
            {moms.map((m) => (
              <tr key={m}>
                <td className="p-1.5 text-gray-400 font-medium">{m}일</td>
                {rebs.map((rb) => {
                  const c = cell(m, rb);
                  if (!c) return <td key={rb} />;
                  const [, , ret, mdd] = c;
                  const alpha = Math.max(0.06, Math.min(0.85, ret / maxRet));
                  const isCur = m === curMom && rb === curReb;
                  return (
                    <td key={rb}
                      className={"p-1.5 text-center align-middle " + (isCur ? "ring-2 ring-blue-500 rounded" : "")}
                      style={{ background: ret >= 0 ? `rgba(22,163,74,${alpha})` : `rgba(220,38,38,0.35)` }}>
                      <div className="font-semibold">{ret >= 0 ? "+" : ""}{ret.toFixed(0)}%</div>
                      <div className="text-[10px] opacity-75">{mdd.toFixed(0)}%</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmt(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function Result({ result }: { result: FullResult }) {
  const buys = result.trades.filter((t) => t.side === "buy");
  const sells = result.trades.filter((t) => t.side === "sell");
  const invested = buys.reduce((s, t) => s + t.price * t.qty, 0);
  const returnPct = result.principal > 0 ? (result.totalPnl / result.principal) * 100 : 0;
  const finalEquity = result.equityCurve.at(-1)?.equity ?? 0;
  const wins = sells.filter((t) => t.pnl > 0).length;
  const winRate = sells.length > 0 ? (wins / sells.length) * 100 : 0;
  const maxRound = result.trades.reduce((m, t) => Math.max(m, t.roundNo), 0);

  const isRotation = result.strategy === "rotation_v1";
  const option: EChartsOption = isRotation
    ? {
        // 다중 종목 로테이션 — 단일 가격축 대신 총자산(현금+보유) 곡선으로 표시
        tooltip: { trigger: "axis" },
        legend: { data: ["총자산", "교체/청산"], bottom: 0 },
        grid: { left: 16, right: 16, top: 20, bottom: 44, containLabel: true },
        xAxis: { type: "category", data: result.equityCurve.map((e) => e.date) },
        yAxis: { type: "value", scale: true },
        dataZoom: [{ type: "inside", start: 0, end: 100 }],
        series: [
          { name: "총자산", type: "line", showSymbol: false, data: result.equityCurve.map((e) => e.equity), lineStyle: { width: 1.5 } },
          { name: "교체/청산", type: "scatter", symbol: "triangle", symbolRotate: 180, symbolSize: 9, itemStyle: { color: "#2563eb" },
            data: sells.map((t) => { const eq = result.equityCurve.find((e) => e.date === t.date); return [t.date, eq?.equity ?? null]; }), z: 5 },
        ],
      }
    : {
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: { data: ["종가", "매수", "매도"], bottom: 0 },
    grid: { left: 16, right: 16, top: 20, bottom: 44, containLabel: true },
    xAxis: { type: "category", data: result.bars.map((b) => b.date) },
    yAxis: { type: "value", scale: true },
    dataZoom: [{ type: "inside", start: 0, end: 100 }],
    series: [
      { name: "종가", type: "line", showSymbol: false, data: result.bars.map((b) => b.close), lineStyle: { width: 1.5 } },
      { name: "매수", type: "scatter", symbol: "triangle", symbolSize: 9, itemStyle: { color: "#dc2626" }, data: buys.map((t) => [t.date, t.price]), z: 5 },
      { name: "매도", type: "scatter", symbol: "triangle", symbolRotate: 180, symbolSize: 11, itemStyle: { color: "#2563eb" }, data: sells.map((t) => [t.date, t.price]), z: 6 },
    ],
  };

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Metric label="실현손익" value={fmt(result.totalPnl)} accent={result.totalPnl >= 0 ? "pos" : "neg"} />
        <Metric label="수익률 (원금 대비)" value={`${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%`} accent={returnPct >= 0 ? "pos" : "neg"} />
        {result.strategy.startsWith("infinite") ? (
          <>
            <Metric label="사이클 (익절 횟수)" value={`${sells.length}회`} />
            <Metric label="최대 도달 회차" value={`${maxRound} / ${result.trades.length}건`} />
            <Metric label="총 매수 금액" value={fmt(invested)} />
          </>
        ) : (
          <>
            <Metric label="매매 사이클 (청산)" value={`${sells.length}회`} />
            <Metric label="승률" value={`${winRate.toFixed(0)}% (${wins}/${sells.length})`} accent={winRate >= 50 ? "pos" : "neg"} />
            <Metric label="진입/청산" value={`${buys.length}/${sells.length}건`} />
          </>
        )}
        <Metric label="현재 보유 평가액" value={fmt(finalEquity)} />
        <Metric label="일봉 기간" value={`${result.bars[0]?.date} ~ ${result.bars.at(-1)?.date}`} />
        <Metric label="바 수" value={`${result.bars.length}일`} />
      </div>

      <div className="w-full aspect-[4/3] sm:aspect-auto sm:h-[400px] mb-6">
        <ReactECharts option={option} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
      </div>

      <h2 className="text-lg font-semibold mb-3">거래 내역 ({result.trades.length}건)</h2>
      <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-100 dark:border-gray-800 rounded">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-white dark:bg-gray-900">
            <tr className="border-b text-gray-500 text-left">
              <th className="py-2 px-3">날짜</th>
              <th className="py-2 px-3">구분</th>
              <th className="py-2 px-3 text-right">가격</th>
              <th className="py-2 px-3 text-right">수량</th>
              <th className="py-2 px-3 text-right">실현손익</th>
              {result.strategy.startsWith("infinite") && <th className="py-2 px-3 text-right">회차</th>}
              {result.strategy === "rotation_v1" && <th className="py-2 px-3 text-left">종목</th>}
            </tr>
          </thead>
          <tbody>
            {result.trades.map((t, i) => (
              <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-1.5 px-3 whitespace-nowrap">{t.date}</td>
                <td className={`py-1.5 px-3 font-medium ${t.side === "buy" ? "text-red-600" : "text-blue-600"}`}>
                  {t.side === "buy" ? "▲ 매수" : "▼ 매도"}
                </td>
                <td className="py-1.5 px-3 text-right">{fmt(t.price)}</td>
                <td className="py-1.5 px-3 text-right">{t.qty.toLocaleString()}</td>
                <td className={`py-1.5 px-3 text-right ${t.pnl > 0 ? "text-red-600" : t.pnl < 0 ? "text-blue-600" : "text-gray-400"}`}>
                  {t.side === "sell" ? fmt(t.pnl) : "—"}
                </td>
                {result.strategy.startsWith("infinite") && <td className="py-1.5 px-3 text-right text-gray-500">{t.roundNo}</td>}
                {result.strategy === "rotation_v1" && <td className="py-1.5 px-3 text-left text-gray-500">{t.ticker}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: "pos" | "neg" }) {
  const color = accent === "pos" ? "text-red-600" : accent === "neg" ? "text-blue-600" : "text-gray-900 dark:text-white";
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
