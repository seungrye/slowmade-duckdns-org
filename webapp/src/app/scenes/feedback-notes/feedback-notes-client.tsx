"use client";

// 피드백 노트 관리 UI (owner 전용). 회차에서 노트 생성 enqueue + 목록/상태/삭제 + 폴링. (#9)

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface NoteItem {
  _id: string;
  runIndex: number;
  endingId: string;
  title: string;
  status: "queued" | "processing" | "ready" | "failed";
  error?: string;
  createdAt: string;
}
interface RunItem {
  _id: string;
  runIndex: number;
  endingId: string;
  completedAt: string;
  log?: string[];
}

const ENDING_LABEL: Record<string, string> = {
  ascension: "승천",
  revolution: "혁명",
  harmony: "조화",
  fall: "몰락",
  petrification: "석화",
  sylvan_bond: "숲의 유대",
};

const STATUS_BADGE: Record<NoteItem["status"], { label: string; cls: string }> = {
  queued: { label: "대기 중", cls: "bg-gray-200 text-gray-700" },
  processing: { label: "생성 중…", cls: "bg-amber-200 text-amber-900" },
  ready: { label: "완료", cls: "bg-emerald-200 text-emerald-900" },
  failed: { label: "실패", cls: "bg-red-200 text-red-900" },
};

export default function FeedbackNotesClient({
  initialNotes,
  runs,
}: {
  initialNotes: NoteItem[];
  runs: RunItem[];
}) {
  const [notes, setNotes] = useState<NoteItem[]>(initialNotes);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/web-adventure/feedback-notes");
      if (!res.ok) return;
      const json = await res.json();
      if (Array.isArray(json.data)) setNotes(json.data as NoteItem[]);
    } catch {
      /* 무시 */
    }
  }, []);

  // 생성 중(queued/processing) 노트가 있으면 주기적으로 상태 갱신.
  useEffect(() => {
    const pending = notes.some((n) => n.status === "queued" || n.status === "processing");
    if (!pending) return;
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [notes, refresh]);

  async function generate(pastRunId: string) {
    setBusy(pastRunId);
    try {
      const res = await fetch("/api/web-adventure/feedback-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pastRunId }),
      });
      if (res.ok) await refresh();
      else alert("노트 생성 요청 실패");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("이 노트를 삭제할까요?")) return;
    const res = await fetch(`/api/web-adventure/feedback-notes/${id}`, { method: "DELETE" });
    if (res.ok) setNotes((prev) => prev.filter((n) => n._id !== id));
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 text-gray-900">
      <h1 className="text-2xl font-bold mb-1">피드백 노트</h1>
      <p className="text-sm text-gray-500 mb-6">
        플레이 회차를 로컬 LLM으로 살 붙인 서사 + 작가 노트. 생성은 큐에서 한 개씩 순차 처리되며 수 분 걸립니다.
      </p>

      {/* 회차에서 생성 */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">내 회차에서 생성</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-gray-400">완료한 회차가 없습니다. 게임을 플레이해 엔딩에 도달하세요.</p>
        ) : (
          <ul className="divide-y border rounded-lg">
            {runs.map((r) => (
              <li key={r._id} className="flex items-center justify-between px-4 py-2 gap-3">
                <span className="text-sm">
                  #{r.runIndex} · {ENDING_LABEL[r.endingId] ?? r.endingId}
                  <span className="text-gray-400"> · 로그 {r.log?.length ?? 0}줄</span>
                </span>
                <button
                  onClick={() => generate(r._id)}
                  disabled={busy === r._id}
                  className="text-xs px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy === r._id ? "요청 중…" : "노트 생성"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 노트 목록 */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">노트</h2>
          <button onClick={refresh} className="text-xs text-indigo-600 hover:underline">새로고침</button>
        </div>
        {notes.length === 0 ? (
          <p className="text-sm text-gray-400">아직 노트가 없습니다.</p>
        ) : (
          <ul className="divide-y border rounded-lg">
            {notes.map((n) => {
              const badge = STATUS_BADGE[n.status];
              const ready = n.status === "ready";
              return (
                <li key={n._id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                      <span className="text-xs text-gray-400">
                        #{n.runIndex} · {ENDING_LABEL[n.endingId] ?? n.endingId}
                      </span>
                    </div>
                    <div className="mt-1 truncate">
                      {ready ? (
                        <Link href={`/scenes/feedback-notes/${n._id}`} className="font-medium text-indigo-700 hover:underline">
                          {n.title || "(제목 없음)"}
                        </Link>
                      ) : (
                        <span className="text-gray-500">{n.title || (n.status === "failed" ? (n.error || "생성 실패") : "생성 대기/진행 중")}</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => remove(n._id)} className="text-xs text-red-500 hover:underline shrink-0">삭제</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
