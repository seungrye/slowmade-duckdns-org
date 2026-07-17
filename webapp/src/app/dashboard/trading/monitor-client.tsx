"use client";

import { useCallback, useEffect, useState } from "react";

/** 자동매매 모니터링 — 실행 이력·주문 로그(30초 자동 갱신, 계정 필터). */

type Run = {
  id: string; portfolioId: string; dateKey: string; phase?: string; status: string;
  dryRun: boolean; catchUp: boolean; summary: string; error: string;
  startedAt: string; finishedAt: string | null; logs: string[];
};
type OrderRow = {
  id: string; envKey: string; market: string; strategy: string; symbol: string;
  side: string; qty: number; price: number; ordType?: string; dryRun: boolean;
  orderNo: string; reason: string; at: string;
};
type Account = { id: string; envKey: string };

const RUNS_SIZE = 15;
const ORDERS_SIZE = 25;

/** 섹션 페이지 네비게이터 — 이전/다음 + "n / m". 범위 밖이면 비활성. */
function Pager({ page, total, size, onPage }: {
  page: number; total: number; size: number; onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const cur = Math.min(page, pages - 1);
  if (total <= size) return null;
  const btn = "px-2 py-0.5 rounded border border-gray-300 dark:border-gray-700 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800";
  return (
    <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
      <button type="button" className={btn} disabled={cur <= 0} onClick={() => onPage(cur - 1)}>← 이전</button>
      <span>{cur + 1} / {pages}<span className="text-gray-400"> · 총 {total.toLocaleString()}건</span></span>
      <button type="button" className={btn} disabled={cur >= pages - 1} onClick={() => onPage(cur + 1)}>다음 →</button>
    </div>
  );
}

export default function TradingMonitorClient() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [runsPage, setRunsPage] = useState(0);
  const [ordersPage, setOrdersPage] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [openLog, setOpenLog] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const reload = useCallback(async (acct: string, rp: number, op: number) => {
    const p = new URLSearchParams({
      runsPage: String(rp), ordersPage: String(op),
      runsSize: String(RUNS_SIZE), ordersSize: String(ORDERS_SIZE),
    });
    if (acct) p.set("accountId", acct);
    const [a, r] = await Promise.all([
      fetch("/api/my/trading/accounts").then((x) => x.json()),
      fetch(`/api/my/trading/runs?${p.toString()}`).then((x) => x.json()),
    ]);
    setAccounts((a.accounts ?? []).map((x: Account & { envKey: string }) => ({ id: x.id, envKey: x.envKey })));
    setRuns(r.runs ?? []);
    setOrders(r.orders ?? []);
    setRunsTotal(r.runsTotal ?? 0);
    setOrdersTotal(r.ordersTotal ?? 0);
    setUpdatedAt(new Date());
  }, []);

  useEffect(() => {
    reload(accountId, runsPage, ordersPage).catch(() => undefined);
    const iv = setInterval(() => reload(accountId, runsPage, ordersPage).catch(() => undefined), 30_000);
    return () => clearInterval(iv);
  }, [reload, accountId, runsPage, ordersPage]);

  return (
    <main className="mx-auto px-4 py-8 max-w-5xl space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">자동매매 모니터링</h1>
          <p className="text-sm text-gray-500 mt-1">
            30초 자동 갱신{updatedAt && ` · 마지막 ${updatedAt.toLocaleTimeString("ko-KR")}`}
            {" · "}설정은 <a href="/dashboard/settings" className="text-blue-600 hover:underline">마이페이지 설정</a>의 자동매매 섹션
          </p>
        </div>
        <select value={accountId}
                onChange={(e) => { setAccountId(e.target.value); setRunsPage(0); setOrdersPage(0); }}
                className="rounded border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm">
          <option value="">전체 계정</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.envKey}</option>)}
        </select>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-2">실행 이력</h2>
        <ul className="space-y-1 text-sm">
          {runs.map((r) => (
            <li key={r.id} className="border-b border-gray-100 dark:border-gray-800 py-1.5">
              <button type="button" className="text-left w-full"
                      onClick={() => setOpenLog(openLog === r.id ? null : r.id)}>
                <span className={r.status === "done" ? "text-green-600" : r.status === "failed" ? "text-red-500" : "text-amber-500"}>
                  [{r.status}]
                </span>{" "}
                {r.dateKey}{r.phase && r.phase !== "main" ? ` · ${r.phase}` : ""} ·{" "}
                {r.dryRun ? "dry" : "LIVE"}{r.catchUp ? " · catch-up" : ""} — {r.summary || r.error}
                <span className="text-gray-400 text-xs ml-2">
                  {new Date(r.startedAt).toLocaleString("ko-KR")}
                </span>
              </button>
              {openLog === r.id && (
                <pre className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-900 rounded p-2 mt-1 overflow-x-auto">
                  {(r.logs ?? []).join("\n") || "(로그 없음)"}
                </pre>
              )}
            </li>
          ))}
          {!runs.length && <li className="text-gray-400">실행 이력 없음</li>}
        </ul>
        <Pager page={runsPage} total={runsTotal} size={RUNS_SIZE}
               onPage={(p) => { setRunsPage(p); setOpenLog(null); }} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">주문 로그</h2>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead><tr className="text-left text-gray-500">
              <th className="py-1 pr-2">시각</th><th className="pr-2">계정</th><th className="pr-2">전략</th>
              <th className="pr-2">종목</th><th className="pr-2">방향</th><th className="pr-2 text-right">수량</th>
              <th className="pr-2 text-right">가격</th><th className="pr-2">유형</th><th>구분</th>
            </tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-gray-100 dark:border-gray-800" title={o.reason}>
                  <td className="py-1 pr-2 whitespace-nowrap">{new Date(o.at).toLocaleString("ko-KR")}</td>
                  <td className="pr-2">{o.envKey}</td>
                  <td className="pr-2">{o.strategy}</td>
                  <td className="pr-2">{o.symbol}</td>
                  <td className={o.side === "buy" ? "text-red-500 pr-2" : "text-blue-500 pr-2"}>{o.side}</td>
                  <td className="pr-2 text-right">{o.qty}</td>
                  <td className="pr-2 text-right">{o.price.toLocaleString()}</td>
                  <td className="pr-2">{o.ordType ?? "market"}</td>
                  <td>{o.dryRun ? "dry" : `LIVE ${o.orderNo}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!orders.length && <p className="text-gray-400 text-sm">주문 로그 없음</p>}
        </div>
        <Pager page={ordersPage} total={ordersTotal} size={ORDERS_SIZE} onPage={setOrdersPage} />
      </section>
    </main>
  );
}
