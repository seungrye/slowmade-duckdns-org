// /scenes/status — owner 전용 서버 상태 (읽기 전용). (#9, #55)
//
// webapp 은 시스템을 직접 건드리지 않는다(보안). 로컬 shim 의 read-only /api/system
// (RAM·디스크·업타임·부하·활성 모델, sudo 없음)·/api/state 를 내부(127.0.0.1) 로 프록시해
// 표시만 한다. shim 이 상태 제공, webapp 은 표시.

import { notFound } from 'next/navigation';
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/require-owner';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

interface SystemInfo {
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

function gb(bytes?: number): string {
  if (typeof bytes !== 'number') return '—';
  return (bytes / 1e9).toFixed(1) + ' GB';
}
function dur(sec?: number | null): string {
  if (typeof sec !== 'number') return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default async function ServerStatusPage() {
  const owner = await requireOwner();
  if (owner instanceof NextResponse) notFound();

  const root = env.llmBaseUrl.replace(/\/v1\/?$/, '');
  const [sys, state] = await Promise.all([
    fetchJson<SystemInfo>(`${root}/api/system`),
    fetchJson<StateInfo>(`${root}/api/state`),
  ]);

  const ramPct = sys?.ram && sys.ram.total ? Math.round((100 * sys.ram.used) / sys.ram.total) : null;
  const diskPct = sys?.disk && sys.disk.total ? Math.round((100 * sys.disk.used) / sys.disk.total) : null;

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 text-gray-900">
      <h1 className="text-2xl font-bold mb-1">서버 상태</h1>
      <p className="text-sm text-gray-500 mb-6">
        로컬 LLM(shim) 읽기 전용 상태. 이 페이지는 시스템을 변경하지 않습니다.
      </p>

      {!sys ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          shim 상태 응답 없음 (127.0.0.1 내부 서버 미동작이거나 응답 지연).
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card title="RAM">
            <Big>{gb(sys.ram?.used)} / {gb(sys.ram?.total)}</Big>
            <Sub>여유 {gb(sys.ram?.available)}{ramPct !== null ? ` · ${ramPct}% 사용` : ''}</Sub>
          </Card>
          <Card title={`디스크 ${sys.disk?.path ?? ''}`}>
            <Big>{gb(sys.disk?.free)} 여유</Big>
            <Sub>{gb(sys.disk?.used)} / {gb(sys.disk?.total)}{diskPct !== null ? ` · ${diskPct}%` : ''}</Sub>
          </Card>
          <Card title="업타임">
            <Big>{dur(sys.uptime_sec)}</Big>
            <Sub>부하 {sys.loadavg ? sys.loadavg.map((x) => x.toFixed(2)).join(' / ') : '—'}</Sub>
          </Card>
          <Card title="활성 모델">
            <Big>{sys.active_model || state?.active || '—'}</Big>
            <Sub>상태: {state?.status || sys.state || '—'}</Sub>
          </Card>
        </div>
      )}

      {state?.models && state.models.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">모델 카탈로그</h2>
          <ul className="divide-y border rounded-lg">
            {state.models.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className={m.active ? 'font-semibold text-indigo-700' : ''}>{m.id}</span>
                <span className="text-gray-400">{m.size_gb} GB{m.active ? ' · 활성' : ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4 bg-white">
      <div className="text-xs text-gray-500 mb-1">{title}</div>
      {children}
    </div>
  );
}
function Big({ children }: { children: React.ReactNode }) {
  return <div className="text-lg font-bold tabular-nums">{children}</div>;
}
function Sub({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-gray-400 mt-1 tabular-nums">{children}</div>;
}
