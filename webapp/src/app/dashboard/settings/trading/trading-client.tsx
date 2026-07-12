"use client";

import { useCallback, useState } from "react";

/**
 * 자동매매 설정 — 계정(다수)·포트폴리오 블록·wire 토글·실행 이력.
 * 시크릿은 서버에서 마스킹돼 내려오고, 수정 시 새 값을 입력한 필드만 교체된다.
 */

type Account = {
  id: string; broker: "kis" | "toss"; env: string; name: string; envKey: string;
  liveEnabled: boolean; memo: string; credentials: Record<string, string>;
};
type Portfolio = {
  id: string; accountId: string; market: "kr" | "us"; strategy: string; runAt: string;
  weekdaysOnly: boolean; enabled: boolean; config: Record<string, unknown>;
  state: Record<string, unknown>;
};
const inputCls =
  "w-full rounded border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm";
const btnCls =
  "rounded bg-blue-600 text-white text-sm px-3 py-1.5 hover:bg-blue-700 disabled:opacity-50";
const CRED_FIELDS: Record<string, { key: string; label: string; required: boolean }[]> = {
  kis: [
    { key: "appKey", label: "KIS_APP_KEY", required: true },
    { key: "appSecret", label: "KIS_APP_SECRET", required: true },
    { key: "accountNo", label: "KIS_ACCOUNT_NO (12345678-01)", required: true },
  ],
  toss: [
    { key: "clientId", label: "TOSS_CLIENT_ID", required: true },
    { key: "clientSecret", label: "TOSS_CLIENT_SECRET", required: true },
    { key: "accountSeq", label: "TOSS_ACCOUNT_SEQ (생략 시 자동)", required: false },
  ],
};
const DEFAULT_CONFIG: Record<string, object> = {
  lrs_v1: { signal: "QQQ", target: "TQQQ", sma: 200, band: 1 },
  rotation_v1: { signal: "QQQ", sma: 200, band: 1, mom: 126, rebalance: 63 },
  trend_v1: { universe: ["TQQQ", "QQQ"], shortMa: 20, longMa: 60, positionSize: 0.1 },
  infinite_v4: { symbol: "TQQQ", principal: 10000, splits: 20, starBase: 15, sellTarget: 15 },
};
const DEFAULT_RUN_AT: Record<string, { kr: string; us: string }> = {
  lrs_v1: { kr: "09:05", us: "09:35" },
  rotation_v1: { kr: "09:05", us: "09:35" },
  trend_v1: { kr: "15:40", us: "09:35" },
  infinite_v4: { kr: "09:30", us: "09:35" }, // 국장 v4: 09:30 매도 + 15:20 매수(자동)
};

type InitialData = { accounts: Account[]; portfolios: Portfolio[]; liveAllowed: boolean };

export default function TradingSettingsClient({ initial }: { initial: InitialData }) {
  // SSR 주입 초기값 — 마운트 후 재조회 없음(변이 시에만 reload). ISR 은 부적합:
  // owner 전용 개인 데이터 + wire 토글 등 실시간 상태라 캐시 금지(force-dynamic SSR).
  const [accounts, setAccounts] = useState<Account[]>(initial.accounts);
  const [portfolios, setPortfolios] = useState<Portfolio[]>(initial.portfolios);
  const [liveAllowed, setLiveAllowed] = useState(initial.liveAllowed);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // 계정 추가 폼
  const [nBroker, setNBroker] = useState<"kis" | "toss">("kis");
  const [nEnv, setNEnv] = useState("paper");
  const [nName, setNName] = useState("");
  const [nCreds, setNCreds] = useState<Record<string, string>>({});

  // 포트폴리오 편집 폼
  const [pAccount, setPAccount] = useState("");
  const [pMarket, setPMarket] = useState<"kr" | "us">("us");
  const [pStrategy, setPStrategy] = useState("lrs_v1");
  const [pRunAt, setPRunAt] = useState("09:35");
  const [pConfig, setPConfig] = useState(JSON.stringify(DEFAULT_CONFIG.lrs_v1, null, 2));

  const reload = useCallback(async () => {
    const [a, p] = await Promise.all([
      fetch("/api/my/trading/accounts").then((x) => x.json()),
      fetch("/api/my/trading/portfolios").then((x) => x.json()),
    ]);
    setAccounts(a.accounts ?? []);
    setLiveAllowed(Boolean(a.liveAllowed));
    setPortfolios(p.portfolios ?? []);
  }, []);

  const addAccount = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/my/trading/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ broker: nBroker, env: nEnv, name: nName, ...nCreds }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "실패");
      setNName("");
      setNCreds({});
      setMsg(`계정 추가됨: ${d.envKey}`);
      await reload();
    } catch (e) {
      setMsg(`계정 추가 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const toggleLive = async (a: Account) => {
    if (!a.liveEnabled && !confirm(
      `[${a.envKey}] 실주문(wire)을 켭니다.\n서버 게이트(TRADING_LIVE_ALLOWED=${liveAllowed}) 와 AND 로 동작합니다. 계속할까요?`,
    )) return;
    await fetch("/api/my/trading/accounts", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: a.id, liveEnabled: !a.liveEnabled }),
    });
    await reload();
  };

  const removeAccount = async (a: Account) => {
    if (!confirm(`[${a.envKey}] 계정과 그 포트폴리오·이력을 삭제할까요?`)) return;
    await fetch(`/api/my/trading/accounts?id=${a.id}`, { method: "DELETE" });
    await reload();
  };

  const savePortfolio = async () => {
    setBusy(true);
    setMsg("");
    try {
      let config: unknown;
      try {
        config = JSON.parse(pConfig);
      } catch {
        throw new Error("config JSON 형식 오류");
      }
      const res = await fetch("/api/my/trading/portfolios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: pAccount, market: pMarket, strategy: pStrategy,
                               runAt: pRunAt, config }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "실패");
      setMsg("포트폴리오 저장됨");
      await reload();
    } catch (e) {
      setMsg(`저장 실패: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const runNow = async (portfolioId: string) => {
    setBusy(true);
    setMsg("dry-run 실행 중…(시세 조회로 수십 초 걸릴 수 있음)");
    try {
      const res = await fetch("/api/my/trading/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ portfolioId }),
      });
      const d = await res.json();
      setMsg(res.ok ? `완료: ${d.summary}` : `실패: ${d.error}`);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-gray-500 mt-1">
          기본은 <b>dry-run</b>(주문 미전송, 로그만). 실주문은 계정별 wire 토글 × 서버 게이트
          (현재 {liveAllowed ? "허용" : "차단"}) 둘 다 켜져야 나간다 — 포트폴리오의
          <b> 실주문/dry 뱃지</b>가 스케줄 실행의 유효 모드다. &quot;테스트 실행&quot; 버튼은
          모드와 무관하게 항상 dry. 시크릿은 암호화 저장·마스킹 표시.
        </p>
        {msg && <p className="text-sm text-amber-600 mt-2">{msg}</p>}
      </div>

      {/* 계정 목록 */}
      <section>
        <h2 className="text-lg font-semibold mb-2">증권사 계정 ({accounts.length})</h2>
        <ul className="space-y-2">
          {accounts.map((a) => (
            <li key={a.id} className="border border-gray-200 dark:border-gray-700 rounded p-3 text-sm">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <b>{a.envKey}</b>
                  <span className="text-gray-500 ml-2">{a.broker.toUpperCase()} · {a.env}</span>
                  <span className="text-gray-400 ml-2 text-xs">
                    {Object.entries(a.credentials).map(([k, v]) => `${k}=${v}`).join(" · ")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleLive(a)}
                    className={`text-xs px-2 py-1 rounded border ${
                      a.liveEnabled
                        ? "bg-red-600 text-white border-red-600"
                        : "border-gray-300 text-gray-600 dark:border-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {a.liveEnabled ? "LIVE ON" : "dry-run"}
                  </button>
                  <button onClick={() => removeAccount(a)} className="text-xs text-red-500 cursor-pointer hover:underline hover:text-red-600">삭제</button>
                </div>
              </div>
            </li>
          ))}
          {!accounts.length && <li className="text-sm text-gray-400">등록된 계정이 없습니다.</li>}
        </ul>

        {/* 계정 추가 */}
        <div className="mt-4 border border-dashed border-gray-300 dark:border-gray-700 rounded p-3 space-y-2">
          <div className="flex gap-2 flex-wrap">
            <select value={nBroker} onChange={(e) => { setNBroker(e.target.value as "kis" | "toss"); setNCreds({}); }} className={inputCls + " !w-32"}>
              <option value="kis">한국투자(KIS)</option>
              <option value="toss">토스증권</option>
            </select>
            {nBroker === "kis" && (
              <select value={nEnv} onChange={(e) => setNEnv(e.target.value)} className={inputCls + " !w-28"}>
                <option value="paper">모의(paper)</option>
                <option value="real">실전(real)</option>
              </select>
            )}
            <input value={nName} onChange={(e) => setNName(e.target.value)}
                   placeholder="라벨(예: 50194613)" className={inputCls + " !w-44"} />
          </div>
          <div className="grid md:grid-cols-3 gap-2">
            {CRED_FIELDS[nBroker].map((f) => (
              <input key={f.key} type="password" autoComplete="off"
                     value={nCreds[f.key] ?? ""}
                     onChange={(e) => setNCreds((c) => ({ ...c, [f.key]: e.target.value }))}
                     placeholder={f.label + (f.required ? " *" : "")} className={inputCls} />
            ))}
          </div>
          <button onClick={addAccount} disabled={busy} className={btnCls}>계정 추가</button>
        </div>
      </section>

      {/* 포트폴리오 블록 */}
      <section>
        <h2 className="text-lg font-semibold mb-2">포트폴리오 (계정×시장, {portfolios.length})</h2>
        <ul className="space-y-2 mb-4">
          {portfolios.map((p) => {
            const acct = accounts.find((a) => a.id === p.accountId);
            // 유효 모드 = 계정 LIVE 토글 × 서버 게이트 — 스케줄 실행이 실제 주문을 내는지.
            const effectiveLive = Boolean(acct?.liveEnabled) && liveAllowed;
            return (
              <li key={p.id} className="border border-gray-200 dark:border-gray-700 rounded p-3 text-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className={`text-xs px-1.5 py-0.5 rounded mr-2 font-semibold ${
                      effectiveLive ? "bg-red-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                    }`}>{effectiveLive ? "실주문" : "dry"}</span>
                    <b>{acct?.envKey ?? "?"}</b> · {p.market.toUpperCase()} · {p.strategy}
                    <span className="text-gray-500 ml-2">매일 {p.runAt} {p.market === "kr" ? "KST" : "ET"}</span>
                    {!p.enabled && <span className="text-red-500 ml-2">(비활성)</span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => runNow(p.id)} disabled={busy}
                            title="설정 검증용 수동 1회 실행 — 계정 모드와 무관하게 항상 dry"
                            className="text-xs px-2.5 py-1 rounded border border-blue-500 text-blue-600 cursor-pointer hover:bg-blue-600 hover:text-white active:scale-95 transition disabled:opacity-50 disabled:cursor-wait">
                      dry-run 실행
                    </button>
                    <button
                      onClick={async () => {
                        await fetch(`/api/my/trading/portfolios?id=${p.id}`, { method: "DELETE" });
                        await reload();
                      }}
                      className="text-xs text-red-500 cursor-pointer hover:underline hover:text-red-600"
                    >삭제</button>
                  </div>
                </div>
                <pre className="text-xs text-gray-500 mt-1 overflow-x-auto">{JSON.stringify(p.config)}</pre>
              </li>
            );
          })}
        </ul>

        <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded p-3 space-y-2">
          <div className="flex gap-2 flex-wrap">
            <select value={pAccount} onChange={(e) => setPAccount(e.target.value)} className={inputCls + " !w-52"}>
              <option value="">계정 선택…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.envKey}</option>)}
            </select>
            <select value={pMarket} onChange={(e) => {
              const m = e.target.value as "kr" | "us";
              setPMarket(m);
              setPRunAt(DEFAULT_RUN_AT[pStrategy]?.[m] ?? (m === "kr" ? "09:05" : "09:35"));
            }} className={inputCls + " !w-24"}>
              <option value="us">미장</option>
              <option value="kr">국장</option>
            </select>
            <select value={pStrategy} onChange={(e) => {
              const st = e.target.value;
              setPStrategy(st);
              setPConfig(JSON.stringify(DEFAULT_CONFIG[st] ?? {}, null, 2));
              setPRunAt(DEFAULT_RUN_AT[st]?.[pMarket] ?? "09:35");
            }} className={inputCls + " !w-40"}>
              <option value="lrs_v1">LRS</option>
              <option value="rotation_v1">모멘텀 로테이션</option>
              <option value="trend_v1">추세추종</option>
              <option value="infinite_v4">무한매수 V4</option>
            </select>
            <div className="flex items-center gap-1">
              <input value={pRunAt} onChange={(e) => setPRunAt(e.target.value)}
                     placeholder="HH:MM" className={inputCls + " !w-24"} />
              <span className="text-xs text-gray-500">{pMarket === "kr" ? "KST" : "ET(미 동부)"}</span>
            </div>
          </div>
          <textarea value={pConfig} onChange={(e) => setPConfig(e.target.value)} rows={6}
                    className={inputCls + " font-mono text-xs"} />
          <details className="text-xs text-gray-500 border border-gray-200 dark:border-gray-700 rounded">
            <summary className="cursor-pointer px-3 py-2 font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 rounded">
              📖 config 작성 가이드 (전략별 필드·예시)
            </summary>
            <div className="px-3 pb-3 space-y-3">
              <p>
                공통: 실행 시각은 <b>국장 KST · 미장 ET</b>(서머타임 자동 반영). 주말 자동 스킵.
                아래 필드 외 값은 무시된다. 저장 후 &quot;dry-run 실행&quot;으로 신호를 미리 확인할 것.
              </p>
              <div>
                <b>LRS (lrs_v1)</b> — 1배 지수 시그널로 레버리지 ETF 전량 스위칭
                <pre className="bg-gray-50 dark:bg-gray-800 rounded p-2 mt-1 overflow-x-auto">{`{
  "signal": "QQQ",   // 레짐 시그널(1배 지수). 국장 "069500"
  "target": "TQQQ",  // 매매 대상(레버리지 ETF). 국장 "122630"
  "sma": 200,        // 시그널 SMA 기간
  "band": 1          // 밴드 히스테리시스 %(왕복 매매 방지)
}`}</pre>
              </div>
              <div>
                <b>모멘텀 로테이션 (rotation_v1)</b> — 후보 중 모멘텀 1위만 보유, 레짐 오프 시 현금
                <pre className="bg-gray-50 dark:bg-gray-800 rounded p-2 mt-1 overflow-x-auto">{`{
  "signal": "QQQ",              // 레짐 시그널. 국장 "069500"
  "candidates": ["TQQQ","SOXL"], // 생략하면 시드에서 거래대금 상위 4종 자동선발
  "sma": 200, "band": 1,
  "mom": 126,                   // 상대 모멘텀 룩백(거래일)
  "rebalance": 63               // 1위 재평가 주기(거래일) — 21일은 whipsaw로 불리
}`}</pre>
              </div>
              <div>
                <b>추세추종 (trend_v1)</b> — 유니버스 골든/데드크로스 스캔
                <pre className="bg-gray-50 dark:bg-gray-800 rounded p-2 mt-1 overflow-x-auto">{`{
  "universe": ["TQQQ","QQQ", ...], // 스캔 종목 배열(필수)
  "excdMap": {"MMM":"NYS"},       // 미장 전용 — NAS 외 거래소 종목 매핑(없으면 NAS 가정)
  "shortMa": 20, "longMa": 60,
  "positionSize": 0.05             // 종목당 현금 비중(0.05 = 5%)
}`}</pre>
              </div>
              <div>
                <b>무한매수 V4 (infinite_v4)</b> — 미장 실제 LOC(KIS 34/토스 CLS), 국장 09:30 매도+15:20 매수 자동(LOC 에뮬)
                <pre className="bg-gray-50 dark:bg-gray-800 rounded p-2 mt-1 overflow-x-auto">{`{
  "symbol": "TQQQ",     // 종목 1개(필수) — 다른 전략과 겹치지 않게
  "principal": 10000,   // 종목 전용 원금(필수) — 복리 장부(cycleCash)의 시작값
  "splits": 20,         // 분할 수 — 20(공격, 리버스 감쇠 0.9) / 40(방어, 0.95)
  "starBase": 15,       // 별% base — TQQQ 15 / SOXL 20
  "sellTarget": 15      // 75% 지정가매도 목표 % (평단 대비)
}`}</pre>
                <p className="mt-1">
                  진행 중 사이클을 이어받을 땐 상태(T·장부현금)가 state.v4 에 저장된다 —
                  기존 보유가 있으면 v4 사이클로 편입되니 종목 중복에 주의. 무한매수 v1 은
                  파이썬 데몬 전용.
                </p>
              </div>
            </div>
          </details>
          <button onClick={savePortfolio} disabled={busy || !pAccount} className={btnCls}>
            포트폴리오 저장(계정×시장 upsert)
          </button>
        </div>
      </section>

      <p className="text-sm">
        <a href="/dashboard/trading" className="text-blue-600 hover:underline">
          실행 이력·주문 로그 보기 → /dashboard/trading
        </a>
      </p>
    </div>
  );
}
