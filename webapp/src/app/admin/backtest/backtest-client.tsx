"use client";

import { useState, useEffect } from "react";
import FactorPanel, { type FactorKind, type CompareEntry } from "./factor-panel";
import { Field } from "./field";
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
import { runDualMomentumBacktest } from "@/lib/backtest/dual-momentum";
import { runVolTargetBacktest } from "@/lib/backtest/vol-target";
import { KR_SEED, US_SEED, type SeedEntry } from "@/lib/backtest/rotation-pool";
import { computeMetrics } from "@/lib/backtest/metrics";
import { runValueRebalancingBacktest } from "@/lib/backtest/value-rebalancing";
import type { Bar, BacktestResult } from "@/lib/backtest/types";

type Strategy =
  | "infinite_v1" | "infinite_v2_1" | "infinite_v2_2" | "infinite_v3_0" | "infinite_v4_0"
  | "trend_v1" | "trend_v2" | "trend_v3" | "trend_v4" | "regime_v1" | "lrs_v1" | "rotation_v1" | "rotation_v2"
  | "dual_momentum_v1" | "vol_target_v1" | "value_rebalancing"
  | "compare" | "factor_momentum" | "factor_low_vol" | "factor_reversal";

const INFINITE_VARIANT_VER: Partial<Record<Strategy, InfiniteVariantVersion>> = {
  infinite_v2_1: "v2_1", infinite_v2_2: "v2_2", infinite_v3_0: "v3_0",
};
type FullResult = BacktestResult & { bars: Bar[]; principal: number; strategy: Strategy };

// 표시 순서 = 추천 순(위험조정수익·강건성 기준). 로테이션 계열 상위(v2 분할매수가 백테스트
// 검증상 최고 — Calmar↑·MDD↓·수수료/시그널/파라미터에 강건), 방어형 모멘텀(LRS·레짐·트레일링
// 추세) 중위, 무한매수(주기적 물타기 — v4 가 가장 완성형) 하위.
const STRATEGY_TABS: readonly (readonly [Strategy, string])[] = [
  ["compare", "비교"],
  ["factor_momentum", "팩터: 모멘텀(12-1)"],
  ["factor_low_vol", "팩터: 저변동성"],
  ["factor_reversal", "팩터: 단기 평균회귀"],
  ["rotation_v2", "모멘텀 로테이션 v2 (분할매수)"],
  ["rotation_v1", "모멘텀 로테이션 v1"],
  ["dual_momentum_v1", "듀얼 모멘텀 GEM (채권 대피)"],
  ["vol_target_v1", "변동성 타깃 레버리지"],
  ["value_rebalancing", "밸류리밸런싱 VR (라오어)"],
  ["lrs_v1", "레버리지 로테이션 v1"],
  ["regime_v1", "레짐 모멘텀 v1"],
  ["trend_v4", "추세추종 v4 (트레일링)"],
  ["trend_v3", "추세추종 v3 (추세필터)"],
  ["trend_v1", "추세추종 v1"],
  ["trend_v2", "추세추종 v2 (MA돌파)"],
  ["infinite_v4_0", "무한매수 v4.0"],
  ["infinite_v2_2", "무한매수 v2.2"],
  ["infinite_v3_0", "무한매수 v3.0"],
  ["infinite_v2_1", "무한매수 v2.1"],
  ["infinite_v1", "무한매수 v1"],
];

// 팩터 개별 탭 → factor.ts 팩터 종류. factor_compare 는 여기 없음(비교 모드 = focus undefined).
const FACTOR_FOCUS: Partial<Record<Strategy, FactorKind>> = {
  factor_momentum: "momentum",
  factor_low_vol: "low_vol",
  factor_reversal: "reversal",
};

const STRATEGY_DESC: Record<Strategy, string> = {
  compare:
    "각 전략 탭에서 '비교에 추가' 로 담은 전략들을 자산곡선·지표로 함께 비교(2개 이상 담아야 활성). 각 전략은 자기 탭 옵션대로 실행된 결과를 재기준(시작=1)해 오버레이. 기간·티커가 다르면 아래 표에 표기.",
  factor_momentum:
    "크로스섹셔널 모멘텀(12-1): 최근 12개월 수익률(최근 1개월 제외) 상위 분위를 동일가중, 월 리밸런스. 유니버스 대상.",
  factor_low_vol:
    "저변동성: 최근 1년 일수익률 표준편차 하위 분위(저변동)를 동일가중, 월 리밸런스. 유니버스 대상.",
  factor_reversal:
    "단기 평균회귀: 최근 1개월 수익률 하위 분위(최근 하락주)를 동일가중, 월 리밸런스. 유니버스 대상.",
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
    "듀얼 모멘텀 × 레짐(LRS): 후보 ETF 중 최근 N거래일 수익률 1위만 전액 보유(상대 모멘텀, 월 1회 재평가·자동 교체), 지수<SMA−밴드면 전량 현금(매일 검사). 종목 선택이 규칙에 내장 — 후보 풀만 정하면 강한 종목으로 자동 로테이션. 후보를 비우면 시드(레버리지 불 계열)에서 거래대금 상위 4종을 자동 선발(기초지수당 1종). 스위칭=당일 종가, 복리, 수수료 미반영.",
  rotation_v2:
    "모멘텀 로테이션 v1 규칙과 동일하되, 진입/교체 시 현금 전액을 한 번에 사지 않고 **K거래일에 나눠 분할매수(DCA)**한다. 진입가를 평균화해 레버리지 ETF 의 단일일 타이밍 리스크·급락 직후 낙폭을 완화(백테스트상 낙폭↓·위험조정수익↑, 특히 K≈15). K는 재평가주기 이하 권장(너무 크면 현금드래그로 수익↓). 레짐 오프 청산·재교체 시 남은 분할계획은 취소.",
  dual_momentum_v1:
    "듀얼 모멘텀(GEM, Gary Antonacci): 후보 ETF 중 최근 N거래일 수익률 1위 보유(상대 모멘텀). 단, 그 1위마저 방어자산(예: IEF 미국채)보다 약하면 **방어자산으로 대피**(절대 모멘텀) — 하락장엔 현금 대신 채권을 들어 방어하면서 이자수익까지 노린다. 로테이션과 달리 SMA 레짐선 없이 '상대+절대' 모멘텀만으로 방어/공격을 전환. 복합 모멘텀(여러 룩백 평균) 옵션으로 타이밍 운을 줄일 수 있다.",
  vol_target_v1:
    "변동성 타깃 레버리지: 레버리지 ETF 를 항상 풀로 들지 않고 **목표 변동성에 맞춰 부분 포지션**으로 노출을 조절한다. 노출 f = min(최대노출, 목표변동성 ÷ 실현변동성) — 시장이 조용하면 많이, 변동성이 치솟으면 자동으로 줄여(현금 확대) 급락 낙폭을 완화한다. 드리프트가 밴드를 넘을 때만 재조정해 매매를 아낀다. 레짐 시그널(1배 지수) 지정 시 SMA 이탈이면 전량 현금.",
  value_rebalancing:
    "라오어 밸류리밸런싱(VR): 레버리지 ETF(예: TQQQ)를 장기 보유하되 목표경로 V의 **밴드(±b) 안**으로 유지하는 밸류애버리징. 계좌 = 주식(평가금) + Pool(현금). 사이클(2주)마다 V₂ = V₁ + Pool/G + 현금흐름으로 목표를 갱신 — **현금비중(P/V)이 목표 기울기를 자동 조절**(Pool↑ 공격적 매수, Pool↓ 공격적 매도). 평가금이 하단 아래면 Pool로 매수(사이클 한도 u 내), 상단 위면 매도해 대금을 Pool로. **G가 위험 다이얼**(클수록 보수적: 수익·위험 함께↓, 위험이 더 빨리↓). 적립(+)/거치(0)/인출(−) 지원. 평단 무관. (실력공식은 원문 미공개 — 기본공식 + 존버감지)",
};

export default function BacktestClient() {
  const [strategy, setStrategy] = useState<Strategy>("rotation_v2"); // 기본=추천 1순위
  const [compare, setCompare] = useState<Partial<Record<Strategy, CompareEntry>>>({}); // 범용 비교에 담긴 전략들
  const tabScroll = useDragScrollX<HTMLDivElement>();
  // 공통
  const [ticker, setTicker] = useState("");
  const [principal, setPrincipal] = useState(4000);
  const [monthlyContribution, setMonthlyContribution] = useState(0); // 적립식: 매월 입금액(0=목돈). rotation/dual/vol 만 지원.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // 무한매수
  const [splits, setSplits] = useState(40);
  const [takeProfitPct, setTakeProfitPct] = useState(10);
  const [locPremiumPct, setLocPremiumPct] = useState(12);
  const [iv4V, setIv4V] = useState(0); // v4 변동성 계수 V(%). 0=비움 → §5.3.2 자동 유도
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
  // 모멘텀 로테이션 v1 / v2(분할매수)
  const [rotCandidates, setRotCandidates] = useState("TQQQ,SOXL,UPRO,TECL");
  const [rotMom, setRotMom] = useState(126);
  const [rotReb, setRotReb] = useState(63);
  const [rotDca, setRotDca] = useState(15); // v2 분할매수 K(슬라이스)
  const [rotComposite, setRotComposite] = useState(false); // 복합 모멘텀(멀티 룩백 평균)
  // 듀얼 모멘텀 GEM
  const [dmCandidates, setDmCandidates] = useState("TQQQ,SOXL,UPRO,TECL");
  const [dmDefensive, setDmDefensive] = useState("IEF");
  const [dmMom, setDmMom] = useState(252);
  const [dmReb, setDmReb] = useState(21);
  const [dmComposite, setDmComposite] = useState(false); // 복합 모멘텀
  // 변동성 타깃 레버리지
  const [vtTargetVol, setVtTargetVol] = useState(25);
  const [vtLookback, setVtLookback] = useState(20);
  const [vtMaxLev, setVtMaxLev] = useState(1.0);
  const [vtBand, setVtBand] = useState(5); // 드리프트 %p
  const [vtSignal, setVtSignal] = useState("QQQ"); // 레짐 시그널(선택)
  const [vtSma, setVtSma] = useState(200);
  // 밸류리밸런싱 VR
  const [vrG, setVrG] = useState(10); // 위험 다이얼(적립·거치 10 / 인출 20)
  const [vrBand, setVrBand] = useState(15); // 밴드폭 % (±15)
  const [vrPoolLimit, setVrPoolLimit] = useState(50); // 사이클당 Pool 매수 한도 % (거치 50 / 적립 75 / 인출 25)
  const [vrCycleDays, setVrCycleDays] = useState(10); // 사이클 거래일(2주)
  const [vrInitStock, setVrInitStock] = useState(85); // 초기 주식 비중 %
  const [vrCashflow, setVrCashflow] = useState(0); // 사이클당 현금흐름(+적립/−인출/0거치)
  const [vrFee, setVrFee] = useState(0); // 편도 수수료 %
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

  // rotation 후보 확정 — 입력이 비면 시드 자동선발 모드(시그널 6자리=국장 시드, 아니면 미장).
  const resolveRotation = (): { list: string[]; autoSeed?: SeedEntry[]; error?: string } => {
    const list = rotCandidates.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
    if (list.length === 1) return { list, error: "후보를 2개 이상 입력하거나, 비워서 자동선발을 쓰세요." };
    if (list.length >= 2) return { list };
    const sig = (lrsSignal.trim() || "QQQ").toUpperCase();
    const seed = /^\d{6}$/.test(sig) ? KR_SEED : US_SEED;
    return { list: seed.map((s) => s.ticker), autoSeed: seed };
  };

  // rotation 전용 — mom×재평가 그리드를 일괄 백테스트해 파라미터 민감도(강건성)를 본다.
  const runRobustnessScan = async () => {
    const rot = resolveRotation();
    if (rot.error) { setError(rot.error); return; }
    const rotList = rot.list;
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
            rebalanceDays: rb, from: from || undefined, to: to || undefined,
            autoSeed: rot.autoSeed, dcaSlices: strategy === "rotation_v2" ? rotDca : undefined,
            contribution: monthlyContribution || undefined });
          // 적립식·원금0 대응 — finalV/principal(0 나눗셈) 대신 computeMetrics(TWR) 사용.
          const rm = computeMetrics(rr.equityCurve, principal, rr.contributions);
          out.push([m, rb, rm.totalReturnPct, rm.mdd]);
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
    // rotation·듀얼모멘텀은 후보 필드가 종목 입력을 대신 → 단일 종목 코드 불필요
    const noSingleTicker = strategy.startsWith("rotation") || strategy === "dual_momentum_v1";
    if (!noSingleTicker && !ticker.trim()) {
      setError("종목 코드를 입력하세요.");
      return;
    }
    const rot = strategy.startsWith("rotation") ? resolveRotation() : null;
    if (rot?.error) {
      setError(rot.error);
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
      if (strategy.startsWith("rotation") && rot) {
        // 후보 전체 + 시그널을 전체 이력으로 조회(지표 워밍업), 매매 구간은 from/to 로 제한
        const rotList = rot.list;
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
            momLookbacks: rotComposite ? [21, 63, 126, 252] : undefined,
            rebalanceDays: rotReb, from: from || undefined, to: to || undefined,
            autoSeed: rot.autoSeed, dcaSlices: strategy === "rotation_v2" ? rotDca : undefined,
            contribution: monthlyContribution || undefined });
        const rangeSig = sigBars.filter((b) => (!from || b.date >= from) && (!to || b.date <= to));
        setResult({ ...rr, bars: rangeSig, principal, strategy });
        return;
      }
      // 듀얼 모멘텀 GEM — 후보(위험) + 방어자산을 전체 이력으로 조회, 매매 구간은 from/to
      if (strategy === "dual_momentum_v1") {
        const candList = dmCandidates.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
        const defTicker = dmDefensive.trim().toUpperCase();
        if (candList.length < 1 || !defTicker) {
          setError("후보 종목과 방어자산(예: IEF)을 입력하세요."); setLoading(false); return;
        }
        const fetchBars = async (t: string): Promise<Bar[]> => {
          const res0 = await fetch(`/api/admin/backtest/prices?ticker=${encodeURIComponent(t)}`);
          if (!res0.ok) throw new Error(`${t} 데이터 조회 실패 (${res0.status})`);
          const b: Bar[] = (await res0.json()).bars ?? [];
          if (b.length === 0) throw new Error(`${t} 일봉 데이터가 없습니다.`);
          return b;
        };
        const [defBars, ...candBars] = await Promise.all([fetchBars(defTicker), ...candList.map(fetchBars)]);
        const dr = runDualMomentumBacktest(
          candList.map((t, i) => ({ ticker: t, bars: candBars[i] })),
          { ticker: defTicker, bars: defBars },
          { principal, momDays: dmMom, momLookbacks: dmComposite ? [21, 63, 126, 252] : undefined,
            rebalanceDays: dmReb, from: from || undefined, to: to || undefined,
            contribution: monthlyContribution || undefined });
        const rangeBars = defBars.filter((b) => (!from || b.date >= from) && (!to || b.date <= to));
        setResult({ ...dr, bars: rangeBars, principal, strategy });
        return;
      }
      // 변동성 타깃 — 대상 ETF 전체 이력 + 레짐 시그널(선택). from/to 는 러너 내부에서 제한.
      if (strategy === "vol_target_v1") {
        const fetchBars = async (t: string): Promise<Bar[]> => {
          const res0 = await fetch(`/api/admin/backtest/prices?ticker=${encodeURIComponent(t)}`);
          if (!res0.ok) throw new Error(`${t} 데이터 조회 실패 (${res0.status})`);
          const b: Bar[] = (await res0.json()).bars ?? [];
          if (b.length === 0) throw new Error(`${t} 일봉 데이터가 없습니다.`);
          return b;
        };
        const tgt = ticker.trim().toUpperCase();
        const useSignal = !!vtSignal.trim();
        const [tgtBars, sigBars] = await Promise.all([
          fetchBars(tgt),
          useSignal ? fetchBars(vtSignal.trim().toUpperCase()) : Promise.resolve<Bar[]>([]),
        ]);
        const vr = runVolTargetBacktest({ ticker: tgt, bars: tgtBars }, {
          principal, targetVolPct: vtTargetVol, volLookback: vtLookback, maxLeverage: vtMaxLev,
          rebalanceBand: vtBand / 100, from: from || undefined, to: to || undefined,
          smaPeriod: useSignal ? vtSma : undefined, contribution: monthlyContribution || undefined,
        }, useSignal ? sigBars : undefined);
        const rangeBars = tgtBars.filter((b) => (!from || b.date >= from) && (!to || b.date <= to));
        setResult({ ...vr, bars: rangeBars, principal, strategy });
        return;
      }
      // 밸류리밸런싱 VR — 대상 ETF 전체 이력. from/to 는 러너 내부에서 제한.
      if (strategy === "value_rebalancing") {
        const tgt = ticker.trim().toUpperCase();
        const res0 = await fetch(`/api/admin/backtest/prices?ticker=${encodeURIComponent(tgt)}`);
        if (!res0.ok) throw new Error(`${tgt} 데이터 조회 실패 (${res0.status})`);
        const tgtBars: Bar[] = (await res0.json()).bars ?? [];
        if (tgtBars.length === 0) throw new Error(`${tgt} 일봉 데이터가 없습니다.`);
        const vrr = runValueRebalancingBacktest({ ticker: tgt, bars: tgtBars }, {
          principal, gradient: vrG, bandPct: vrBand / 100, poolLimitPct: vrPoolLimit / 100,
          cycleDays: vrCycleDays, initStockRatio: vrInitStock / 100,
          cashflow: vrCashflow || undefined, feeRate: vrFee ? vrFee / 100 : undefined,
          from: from || undefined, to: to || undefined,
        });
        const rangeBars = tgtBars.filter((b) => (!from || b.date >= from) && (!to || b.date <= to));
        setResult({ ...vrr, bars: rangeBars, principal, strategy });
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
        if (strategy === "infinite_v4_0") return runInfiniteV4Backtest(bars, { principal, splits, v: iv4V || undefined });
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

  const strategyLabel = (s: Strategy): string => STRATEGY_TABS.find(([k]) => k === s)?.[1] ?? s;
  const setCompareEntry = (s: Strategy, e: CompareEntry | null) =>
    setCompare((prev) => {
      const n = { ...prev };
      if (e) n[s] = e;
      else delete n[s];
      return n;
    });
  // 브라우저 전략 결과 → 비교 항목(재기준 시작=1). 지표는 computeMetrics 재사용.
  const entryFromResult = (fr: FullResult): CompareEntry => {
    const base = fr.equityCurve[0]?.equity || 1;
    const isPortfolio =
      fr.strategy.startsWith("rotation") || fr.strategy === "dual_momentum_v1" || fr.strategy === "vol_target_v1";
    const under = isPortfolio ? "" : ticker || "";
    return {
      label: strategyLabel(fr.strategy),
      sub: `${under ? under + " · " : ""}${from || "?"}~${to || "?"}`,
      curve: fr.equityCurve.map((p) => ({ date: p.date, v: base > 0 ? p.equity / base : 0 })),
      metrics: computeMetrics(fr.equityCurve, fr.principal, fr.contributions),
    };
  };
  // 담긴 전략을 재실행하면 새 결과로 비교 항목 갱신.
  useEffect(() => {
    if (result && compare[result.strategy]) setCompareEntry(result.strategy, entryFromResult(result));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const isFactor = strategy.startsWith("factor_");
  const compareCount = Object.keys(compare).length;

  return (
    <main className="mx-auto px-4 py-8 max-w-5xl">
      <h1 className="text-2xl font-bold mb-1">백테스트</h1>
      <p className="text-sm text-gray-500 mb-4">
        과거 일봉으로 전략을 시뮬레이션합니다. 연산은 브라우저에서 실행돼 서버 부담이 없습니다.
      </p>

      {/* 전략 탭 */}
      <div {...tabScroll} className="flex flex-nowrap gap-2 border-b mb-4 overflow-x-auto overflow-y-hidden scrollbar-hide">
        {STRATEGY_TABS.map(([s, label]) => {
          const disabled = s === "compare" && compareCount < 2; // 담긴 전략 2개 미만이면 비교 탭 비활성
          return (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() => { if (disabled) return; setStrategy(s); setResult(null); setError(null); }}
              className={
                "px-4 py-2 text-sm border-b-2 -mb-px transition whitespace-nowrap shrink-0 " +
                (disabled ? "border-transparent text-gray-300 dark:text-gray-600 cursor-not-allowed " : "") +
                (strategy === s ? "border-blue-600 text-blue-600 font-medium" : "border-transparent text-gray-500 hover:text-gray-700")
              }
            >
              {label}
              {s === "compare" && compareCount > 0 ? ` (${compareCount})` : ""}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 mb-4">
        {STRATEGY_DESC[strategy]}
        {" 수수료·슬리피지 미반영."}
      </p>

      {strategy === "compare" ? (
        <CompareView compare={compare} onRemove={(s) => setCompareEntry(s, null)} />
      ) : isFactor ? (
        <FactorPanel
          focus={FACTOR_FOCUS[strategy]!}
          defaultFrom={from}
          defaultTo={to}
          inCompare={!!compare[strategy]}
          onSetCompare={(e) => setCompareEntry(strategy, e)}
          principal={principal}
          monthlyContribution={monthlyContribution}
          onPrincipal={setPrincipal}
          onMonthly={setMonthlyContribution}
        />
      ) : (
      <>
      {/* 옵션 폼 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {/* rotation·듀얼모멘텀은 후보 필드가 종목 입력을 대신한다 — 이 필드는 무시되므로 숨겨 혼동 방지 */}
        {!strategy.startsWith("rotation") && strategy !== "dual_momentum_v1" && (
          <Field label="종목 코드" hint={strategy === "vol_target_v1" ? "대상 레버리지 ETF(예: TQQQ)" : "예: TQQQ, 069500"}>
            <input value={ticker} onChange={(e) => setTicker(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder="TICKER" className="input" />
          </Field>
        )}
        <Field label="원금" hint="배정 자본(국장은 원화)">
          <input type="number" value={principal} onChange={(e) => setPrincipal(Number(e.target.value))} className="input" />
        </Field>
        {(strategy.startsWith("rotation") || strategy === "dual_momentum_v1" || strategy === "vol_target_v1") && (
          <Field label="월 적립금" hint="매월 입금액(0=목돈 일시투입). 입금분은 보유에 즉시 투입돼 현금 드래그 없음. 수익률은 TWR 로 표기">
            <input type="number" value={monthlyContribution} min={0} onChange={(e) => setMonthlyContribution(Number(e.target.value))} className="input" />
          </Field>
        )}

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
        {strategy === "infinite_v4_0" && (
          <Field label="V (변동성 계수, %)" hint="비우면 자동(V≈4×일간σ%, §5.3.2). 종목별: TQQQ 15 · SOXL 20 · KODEX레버리지 8. ⚠σ→V는 미검증 추론(§5.5)">
            <input type="number" value={iv4V || ""} min={0} placeholder="자동" onChange={(e) => setIv4V(Number(e.target.value))} className="input" />
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
        {strategy.startsWith("rotation") && (
          <>
            <Field label="후보 종목(콤마)" hint="이 중 모멘텀 1위만 보유. 비우면 시드에서 거래대금 상위 자동선발">
              <input value={rotCandidates} onChange={(e) => setRotCandidates(e.target.value)}
                placeholder="비우면 자동선발" className="input" />
            </Field>
            <Field label="시그널 종목" hint="레짐 판단 1배 지수 — 미장 QQQ(기본) · 국장 069500">
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
            {strategy === "rotation_v2" && (
              <Field label="분할매수 K(슬라이스)" hint="진입/교체 시 K거래일에 나눠 매수(1=일시금). 재평가주기 이하 권장(예 10~21)">
                <input type="number" value={rotDca} min={1} onChange={(e) => setRotDca(Number(e.target.value))} className="input" />
              </Field>
            )}
            <Field label="복합 모멘텀" hint="여러 룩백(21·63·126·252) 평균 — 강건성↑. 켜면 위 모멘텀 일수 무시">
              <label className="flex items-center gap-2 h-[38px]">
                <input type="checkbox" checked={rotComposite} onChange={(e) => setRotComposite(e.target.checked)} className="w-4 h-4" />
                <span className="text-sm text-gray-600 dark:text-gray-300">{rotComposite ? "켜짐(멀티 룩백)" : "꺼짐(단일)"}</span>
              </label>
            </Field>
          </>
        )}
        {strategy === "dual_momentum_v1" && (
          <>
            <Field label="후보 종목(콤마)" hint="이 중 모멘텀 1위 보유(상대 모멘텀)">
              <input value={dmCandidates} onChange={(e) => setDmCandidates(e.target.value)} placeholder="TQQQ,SOXL,UPRO,TECL" className="input" />
            </Field>
            <Field label="방어자산" hint="1위가 약하면 대피(예: IEF 미국채)">
              <input value={dmDefensive} onChange={(e) => setDmDefensive(e.target.value)} placeholder="IEF" className="input" />
            </Field>
            <Field label="모멘텀 일수" hint="수익률 룩백(기본 252≈12개월)">
              <input type="number" value={dmMom} min={5} onChange={(e) => setDmMom(Number(e.target.value))} className="input" />
            </Field>
            <Field label="재평가 주기(일)" hint="1위 재선정(기본 21≈월 1회)">
              <input type="number" value={dmReb} min={1} onChange={(e) => setDmReb(Number(e.target.value))} className="input" />
            </Field>
            <Field label="복합 모멘텀" hint="여러 룩백(21·63·126·252) 평균. 켜면 위 모멘텀 일수 무시">
              <label className="flex items-center gap-2 h-[38px]">
                <input type="checkbox" checked={dmComposite} onChange={(e) => setDmComposite(e.target.checked)} className="w-4 h-4" />
                <span className="text-sm text-gray-600 dark:text-gray-300">{dmComposite ? "켜짐" : "꺼짐"}</span>
              </label>
            </Field>
          </>
        )}
        {strategy === "vol_target_v1" && (
          <>
            <Field label="목표 변동성 %" hint="연 환산(예: 25). 낮을수록 노출↓">
              <input type="number" value={vtTargetVol} min={1} step={1} onChange={(e) => setVtTargetVol(Number(e.target.value))} className="input" />
            </Field>
            <Field label="변동성 창(일)" hint="실현변동성 계산 기간(기본 20)">
              <input type="number" value={vtLookback} min={2} onChange={(e) => setVtLookback(Number(e.target.value))} className="input" />
            </Field>
            <Field label="최대 노출(배)" hint="1.0=현금 이내, >1=레버리지 허용">
              <input type="number" value={vtMaxLev} min={0.1} step={0.1} onChange={(e) => setVtMaxLev(Number(e.target.value))} className="input" />
            </Field>
            <Field label="리밸런스 밴드 %p" hint="노출 드리프트 이 이상일 때만 재조정(기본 5)">
              <input type="number" value={vtBand} min={0} step={1} onChange={(e) => setVtBand(Number(e.target.value))} className="input" />
            </Field>
            <Field label="레짐 시그널(선택)" hint="1배 지수(예: QQQ). 비우면 레짐 필터 없음">
              <input value={vtSignal} onChange={(e) => setVtSignal(e.target.value)} placeholder="QQQ(선택)" className="input" />
            </Field>
            <Field label="시그널 SMA" hint="레짐 기준(기본 200, 시그널 있을 때만)">
              <input type="number" value={vtSma} min={20} onChange={(e) => setVtSma(Number(e.target.value))} className="input" />
            </Field>
          </>
        )}
        {strategy === "value_rebalancing" && (
          <>
            <Field label="G (위험 다이얼)" hint="클수록 보수적. 적립·거치 10 / 인출 20">
              <input type="number" value={vrG} min={1} step={1} onChange={(e) => setVrG(Number(e.target.value))} className="input" />
            </Field>
            <Field label="밴드 %" hint="±b (기본 15). 매매 빈도 조절(저민감)">
              <input type="number" value={vrBand} min={1} step={1} onChange={(e) => setVrBand(Number(e.target.value))} className="input" />
            </Field>
            <Field label="Pool 사용한도 %" hint="사이클당 매수 상한. 거치 50 / 적립 75 / 인출 25">
              <input type="number" value={vrPoolLimit} min={1} max={100} step={5} onChange={(e) => setVrPoolLimit(Number(e.target.value))} className="input" />
            </Field>
            <Field label="사이클(거래일)" hint="V 갱신 주기. 2주=10">
              <input type="number" value={vrCycleDays} min={1} onChange={(e) => setVrCycleDays(Number(e.target.value))} className="input" />
            </Field>
            <Field label="초기 주식 %" hint="주식:Pool 초기 분할(기본 85 = 85:15)">
              <input type="number" value={vrInitStock} min={1} max={100} step={5} onChange={(e) => setVrInitStock(Number(e.target.value))} className="input" />
            </Field>
            <Field label="사이클당 현금흐름" hint="+적립 / −인출 / 0 거치. TWR 로 수익률 표기">
              <input type="number" value={vrCashflow} step={50} onChange={(e) => setVrCashflow(Number(e.target.value))} className="input" />
            </Field>
            <Field label="수수료 %" hint="편도 수수료+슬리피지(0=무비용)">
              <input type="number" value={vrFee} min={0} step={0.05} onChange={(e) => setVrFee(Number(e.target.value))} className="input" />
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
        {strategy.startsWith("rotation") && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium invisible select-none" aria-hidden="true">스캔</span>
            <button onClick={runRobustnessScan} disabled={scanning}
              className="w-full py-2 rounded border border-blue-600 text-blue-600 font-medium hover:bg-blue-50 disabled:opacity-50 transition">
              {scanning ? "스캔 중…" : "강건성 스캔"}
            </button>
          </div>
        )}
      </div>

      {result && (
        <label className="inline-flex items-center gap-1.5 text-sm mb-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!compare[strategy]}
            onChange={() => setCompareEntry(strategy, compare[strategy] ? null : entryFromResult(result))}
          />
          이 결과를 &quot;비교&quot; 탭에 추가
        </label>
      )}

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
      {scan && strategy.startsWith("rotation") && <RobustnessHeatmap scan={scan} curMom={rotMom} curReb={rotReb} />}
      {result && <Result result={result} />}
      </>
      )}

      <style jsx>{`
        :global(.input) { width: 100%; padding: 0.5rem; border: 1px solid rgb(209 213 219); border-radius: 0.375rem; background: transparent; font-size: 0.875rem; }
        :global(.dark .input) { border-color: rgb(75 85 99); }
      `}</style>
    </main>
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

// "비교" 탭 — 담긴 전략들의 재기준 자산곡선 오버레이 + 지표표. 2개 미만이면 안내.
function CompareView({ compare, onRemove }: { compare: Partial<Record<Strategy, CompareEntry>>; onRemove: (s: Strategy) => void }) {
  const entries = (Object.entries(compare) as [Strategy, CompareEntry | undefined][]).filter(
    (e): e is [Strategy, CompareEntry] => !!e[1],
  );
  if (entries.length < 2) {
    return (
      <p className="text-gray-500 text-sm">
        각 전략 탭에서 백테스트를 실행한 뒤 &quot;비교에 추가&quot; 로 2개 이상 담으면 여기서 함께 비교합니다. (현재 {entries.length}개)
      </p>
    );
  }
  const palette = ["#2563eb", "#db2777", "#16a34a", "#f59e0b", "#7c3aed", "#0891b2", "#dc2626", "#65a30d"];
  const dateSet = new Set<string>();
  for (const [, e] of entries) for (const p of e.curve) dateSet.add(p.date);
  const dates = [...dateSet].sort();
  const option: EChartsOption = {
    tooltip: { trigger: "axis" },
    // 범례는 위 표(전략명=선 색상)가 대신하므로 차트엔 두지 않는다(중복·겹침 제거, 세로 공간 확보).
    grid: { left: 8, right: 14, top: 12, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: dates, boundaryGap: false, axisLabel: { color: "#888", hideOverlap: true } },
    yAxis: { type: "value", scale: true, axisLabel: { color: "#888" } },
    series: entries.map(([, e], i) => {
      const m = new Map(e.curve.map((p) => [p.date, p.v]));
      return {
        name: e.label,
        type: "line",
        showSymbol: false,
        sampling: "lttb",
        connectNulls: false,
        lineStyle: { width: 1.6, color: palette[i % palette.length] },
        itemStyle: { color: palette[i % palette.length] },
        data: dates.map((d) => (m.has(d) ? Number(m.get(d)!.toFixed(4)) : null)),
      };
    }),
  };
  return (
    <div>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
              <th className="py-2 pr-3">전략</th>
              <th className="py-2 pr-3">기간/종목</th>
              <th className="py-2 pr-3 text-right">총수익%</th>
              <th className="py-2 pr-3 text-right">CAGR%</th>
              <th className="py-2 pr-3 text-right">변동성%</th>
              <th className="py-2 pr-3 text-right">MDD%</th>
              <th className="py-2 pr-3 text-right">Sharpe</th>
              <th className="py-2 pr-3 text-right">Calmar</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([s, e], i) => (
              <tr key={s} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2 pr-3 font-medium" style={{ color: palette[i % palette.length] }}>{e.label}</td>
                <td className="py-2 pr-3 text-gray-500 text-xs">{e.sub}</td>
                <td className="py-2 pr-3 text-right">{e.metrics.totalReturnPct.toFixed(1)}</td>
                <td className="py-2 pr-3 text-right">{e.metrics.cagr.toFixed(1)}</td>
                <td className="py-2 pr-3 text-right">{e.metrics.volatility.toFixed(1)}</td>
                <td className="py-2 pr-3 text-right">{e.metrics.mdd.toFixed(1)}</td>
                <td className="py-2 pr-3 text-right">{e.metrics.sharpe.toFixed(2)}</td>
                <td className="py-2 pr-3 text-right">{e.metrics.calmar.toFixed(2)}</td>
                <td className="py-2 text-right">
                  <button onClick={() => onRemove(s)} className="text-gray-400 hover:text-red-500" aria-label="비교에서 제거">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ height: 420 }}>
        <ReactECharts option={option} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
        각 전략의 결과를 시작=1 로 재기준해 겹쳐 그림. 기간·종목이 다르면 위 표의 &quot;기간/종목&quot; 참고. 수수료·슬리피지 미반영.
      </p>
    </div>
  );
}

function Result({ result }: { result: FullResult }) {
  const buys = result.trades.filter((t) => t.side === "buy");
  const sells = result.trades.filter((t) => t.side === "sell");
  const invested = buys.reduce((s, t) => s + t.price * t.qty, 0);
  const returnPct = result.principal > 0 ? (result.totalPnl / result.principal) * 100 : 0;
  const finalEquity = result.equityCurve.at(-1)?.equity ?? 0;
  // 적립식이면 유입 자본을 제거한 시간가중수익(TWR)로 수익률 표기(원금 대비 %는 왜곡되므로).
  // 지표는 늘 계산한다 — 적립식이 아니어도 CAGR·변동성·MDD 는 보여 줘야 한다.
  // (예전엔 적립식일 때만 계산해, 목돈 백테스트는 위험 지표가 아예 안 보였다.)
  const perf = computeMetrics(result.equityCurve, result.principal, result.contributions);
  const twr = result.totalContributed ? perf : null;
  const wins = sells.filter((t) => t.pnl > 0).length;
  const winRate = sells.length > 0 ? (wins / sells.length) * 100 : 0;
  const maxRound = result.trades.reduce((m, t) => Math.max(m, t.roundNo), 0);

  const isRotation = result.strategy.startsWith("rotation");
  // 총자산(현금+보유) 곡선으로 표시할 전략 — 로테이션 계열 + 듀얼모멘텀(다종목) + 변동성타깃(부분 포지션)
  const isPortfolio = isRotation || result.strategy === "dual_momentum_v1" || result.strategy === "vol_target_v1" || result.strategy === "value_rebalancing";
  const option: EChartsOption = isPortfolio
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
        {twr ? (
          <Metric label="수익률 (TWR)" value={`${twr.totalReturnPct >= 0 ? "+" : ""}${twr.totalReturnPct.toFixed(2)}%`} accent={twr.totalReturnPct >= 0 ? "pos" : "neg"} />
        ) : (
          <Metric label="수익률 (원금 대비)" value={`${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%`} accent={returnPct >= 0 ? "pos" : "neg"} />
        )}
        {/* 수익만 보면 얼마나 흔들리며 벌었는지 알 수 없다. 위험을 나란히 놓는다. */}
        <Metric label="연환산 수익률 (CAGR)" value={`${perf.cagr >= 0 ? "+" : ""}${perf.cagr.toFixed(2)}%`} accent={perf.cagr >= 0 ? "pos" : "neg"} />
        <Metric label="연환산 변동성" value={`${perf.volatility.toFixed(2)}%`} />
        <Metric label="최대 낙폭 (MDD)" value={`${perf.mdd.toFixed(2)}%`} accent={perf.mdd < 0 ? "neg" : undefined} />
        {result.strategy.startsWith("infinite") ? (
          <>
            <Metric label="사이클 (익절 횟수)" value={`${sells.length}회`} />
            <Metric label="최대 도달 회차" value={`${maxRound} / ${result.trades.length}건`} />
            <Metric label="총 매수 금액" value={fmt(invested)} />
            {result.resolvedV != null && <Metric label="사용된 V (변동성 계수)" value={`${result.resolvedV}%`} />}
          </>
        ) : (
          <>
            <Metric label="매매 사이클 (청산)" value={`${sells.length}회`} />
            <Metric label="승률" value={`${winRate.toFixed(0)}% (${wins}/${sells.length})`} accent={winRate >= 50 ? "pos" : "neg"} />
            <Metric label="진입/청산" value={`${buys.length}/${sells.length}건`} />
          </>
        )}
        {result.totalContributed ? <Metric label="총 납입원금" value={fmt(result.totalContributed)} /> : null}
        <Metric label="현재 보유 평가액" value={fmt(finalEquity)} />
        <Metric label="일봉 기간" value={`${result.bars[0]?.date} ~ ${result.bars.at(-1)?.date}`} />
        <Metric label="바 수" value={`${result.bars.length}일`} />
      </div>

      <div className="w-full aspect-[4/3] sm:aspect-auto sm:h-[400px] mb-6">
        <ReactECharts option={option} style={{ width: "100%", height: "100%" }} notMerge lazyUpdate />
      </div>

      {result.poolLog && result.poolLog.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">후보 자동선발 이력 ({result.poolLog.length}회)</h2>
          <ul className="max-h-40 overflow-y-auto text-xs text-gray-500 space-y-0.5 border border-gray-100 dark:border-gray-800 rounded p-2">
            {result.poolLog.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </div>
      )}

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
              {isPortfolio && <th className="py-2 px-3 text-left">종목</th>}
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
                {isPortfolio && <td className="py-1.5 px-3 text-left text-gray-500">{t.ticker}</td>}
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
