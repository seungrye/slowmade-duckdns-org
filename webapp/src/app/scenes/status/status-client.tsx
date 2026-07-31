"use client";

// 서버 상태 대시보드 (owner 전용). shim /api/system·/api/state 를 3초마다 폴링해
// CPU/메모리 게이지·부하·코어별·CPU 히스토리를 실시간 갱신. (#19)
// webapp 은 표시만 — 시스템 무접촉.

import { useCallback, useEffect, useRef, useState } from "react";

interface SystemInfo {
  cpu?: { overall: number; cores: number[]; error?: string };
  ncpu?: number;
  ram?: { total: number; available: number; used: number; error?: string };
  disk?: { path: string; total: number; used: number; free: number; error?: string };
  uptime_sec?: number | null;
  loadavg?: number[] | null;
  active_model?: string | null;
  state?: string;
}
interface StateInfo {
  active?: string | null;
  status?: string;
  models?: Array<{ id: string; size_gb: number; active: boolean }>;
}

const REFRESH_MS = 3000;
const HISTORY = 40;

function gb(b?: number) {
  return typeof b === "number" ? (b / 1e9).toFixed(1) + " GB" : "—";
}
function dur(s?: number | null) {
  if (typeof s !== "number") return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
function color(pct: number) {
  return pct >= 85 ? "#dc2626" : pct >= 60 ? "#d97706" : "#059669";
}

function Radial({ label, pct }: { label: string; pct: number }) {
  const p = Math.min(100, Math.max(0, pct));
  const r = 42, c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 100" className="w-28 h-28">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="9" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={color(p)} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)}
          transform="rotate(-90 50 50)" style={{ transition: "stroke-dashoffset .5s, stroke .5s" }}
        />
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="fill-gray-800" fontSize="20" fontWeight="700">
          {p.toFixed(0)}%
        </text>
      </svg>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return <div className="h-10" />;
  const w = 240, h = 40, max = 100;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (Math.min(max, v) / max) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function ServerStatusClient() {
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [state, setState] = useState<StateInfo | null>(null);
  const [down, setDown] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const cpuHist = useRef<number[]>([]);
  const [, forceTick] = useState(0);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/web-adventure/server-status", { cache: "no-store" });
      if (!res.ok) { setDown(true); return; }
      const json = await res.json();
      const s = json.data?.system as SystemInfo | null;
      setSys(s);
      setState(json.data?.state ?? null);
      setDown(!s);
      if (s?.cpu && !s.cpu.error) {
        cpuHist.current = [...cpuHist.current, s.cpu.overall].slice(-HISTORY);
      }
      setUpdatedAt(new Date().toLocaleTimeString());
      forceTick((n) => n + 1);
    } catch {
      setDown(true);
    }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, REFRESH_MS);
    return () => clearInterval(t);
  }, [poll]);

  const ncpu = sys?.ncpu ?? 1;
  const cpuPct = sys?.cpu && !sys.cpu.error ? sys.cpu.overall : 0;
  const ramPct = sys?.ram && sys.ram.total ? (100 * sys.ram.used) / sys.ram.total : 0;
  const diskPct = sys?.disk && sys.disk.total ? (100 * sys.disk.used) / sys.disk.total : 0;

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-gray-900">
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="text-2xl font-bold">서버 상태</h1>
        <span className="text-xs text-gray-400">{REFRESH_MS / 1000}초 갱신{updatedAt ? ` · ${updatedAt}` : ""}</span>
      </div>
      <p className="text-sm text-gray-500 mb-6">로컬 LLM(shim) 읽기 전용 상태. 이 페이지는 시스템을 변경하지 않습니다.</p>

      {down && !sys ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">shim 상태 응답 없음(127.0.0.1 미동작/지연).</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-end">
            <Radial label="CPU" pct={cpuPct} />
            <Radial label="메모리" pct={ramPct} />
            <div className="col-span-2 grid grid-cols-3 gap-2 text-center">
              {(sys?.loadavg ?? [0, 0, 0]).map((v, i) => {
                const ratio = v / ncpu;
                return (
                  <div key={i} className="rounded-lg border p-2 bg-white">
                    <div className="text-[11px] text-gray-400">{["1분", "5분", "15분"][i]} 부하</div>
                    <div className="text-lg font-bold tabular-nums" style={{ color: color(ratio * 100) }}>{v.toFixed(2)}</div>
                  </div>
                );
              })}
              <div className="col-span-3 text-[11px] text-gray-400">코어 {ncpu}개 기준(부하 &gt; {ncpu} 이면 과부하)</div>
            </div>
          </div>

          <section className="mt-6">
            <div className="text-xs text-gray-500 mb-1">CPU 히스토리(최근 {cpuHist.current.length}×{REFRESH_MS / 1000}초)</div>
            <div className="rounded-lg border bg-white px-2 py-1"><Sparkline data={cpuHist.current} /></div>
          </section>

          {sys?.cpu?.cores && sys.cpu.cores.length > 0 && (
            <section className="mt-6">
              <div className="text-xs text-gray-500 mb-2">코어별 사용률</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {sys.cpu.cores.map((v, i) => (
                  <div key={i} className="text-xs">
                    <div className="flex justify-between"><span className="text-gray-400">c{i}</span><span className="tabular-nums">{v.toFixed(0)}%</span></div>
                    <div className="h-1.5 bg-gray-200 rounded overflow-hidden mt-0.5">
                      <div className="h-full rounded" style={{ width: `${Math.min(100, v)}%`, background: color(v), transition: "width .5s" }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <Card title={`디스크 ${sys?.disk?.path ?? ""}`}>
              <Big>{gb(sys?.disk?.free)} 여유</Big>
              <Bar pct={diskPct} />
              <Sub>{gb(sys?.disk?.used)} / {gb(sys?.disk?.total)}</Sub>
            </Card>
            <Card title="업타임"><Big>{dur(sys?.uptime_sec)}</Big><Sub>RAM {gb(sys?.ram?.used)} / {gb(sys?.ram?.total)}</Sub></Card>
            <Card title="활성 모델"><Big className="text-base">{sys?.active_model || state?.active || "—"}</Big><Sub>상태: {state?.status || sys?.state || "—"}</Sub></Card>
          </div>

          {state?.models && state.models.length > 0 && (
            <section className="mt-6">
              <div className="text-xs text-gray-500 mb-2">모델 카탈로그</div>
              <ul className="divide-y border rounded-lg">
                {state.models.map((m) => (
                  <li key={m.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className={m.active ? "font-semibold text-indigo-700" : ""}>{m.id}</span>
                    <span className="text-gray-400">{m.size_gb} GB{m.active ? " · 활성" : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-lg border p-4 bg-white">
    <div className="text-xs text-gray-500 mb-1">{title}</div>{children}
  </div>;
}
function Big({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-lg font-bold tabular-nums ${className}`}>{children}</div>;
}
function Sub({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-gray-400 mt-1 tabular-nums">{children}</div>;
}
function Bar({ pct }: { pct: number }) {
  return <div className="h-1.5 bg-gray-200 rounded overflow-hidden my-1">
    <div className="h-full rounded" style={{ width: `${Math.min(100, pct)}%`, background: color(pct), transition: "width .5s" }} />
  </div>;
}
