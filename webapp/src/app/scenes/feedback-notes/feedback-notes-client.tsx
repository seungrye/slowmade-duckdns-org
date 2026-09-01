"use client";

// 피드백 노트 목록 UI (owner 전용). 노트는 엔딩 시 자동 생성 — 이 화면은 열람/상태/삭제 + 폴링. (#9, #11)

import { useCallback, useEffect, useState } from "react";
import { endingLabel } from "@/content/web-adventure/endings";
import Link from "next/link";

interface NoteItem {
  _id: string;
  runIndex: number;
  endingId: string;
  sourceUserEmail?: string;
  title: string;
  status: "queued" | "processing" | "ready" | "failed";
  error?: string;
  createdAt: string;
}


const STATUS_BADGE: Record<NoteItem["status"], { label: string; cls: string }> = {
  queued: { label: "대기 중", cls: "bg-gray-200 text-gray-700" },
  processing: { label: "생성 중…", cls: "bg-amber-200 text-amber-900" },
  ready: { label: "완료", cls: "bg-emerald-200 text-emerald-900" },
  failed: { label: "실패", cls: "bg-red-200 text-red-900" },
};

export default function FeedbackNotesClient({ initialNotes }: { initialNotes: NoteItem[] }) {
  const [notes, setNotes] = useState<NoteItem[]>(initialNotes);

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

  async function remove(id: string) {
    if (!confirm("이 노트를 삭제할까요?")) return;
    const res = await fetch(`/api/web-adventure/feedback-notes/${id}`, { method: "DELETE" });
    if (res.ok) setNotes((prev) => prev.filter((n) => n._id !== id));
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 text-gray-900">
      <h1 className="text-2xl font-bold mb-1">피드백 노트</h1>
      <p className="text-sm text-gray-500 mb-6">
        플레이어가 엔딩에 도달하면 자동으로 생성됩니다(로컬 LLM, 큐에서 순차 처리 — 수 분 소요). 살 붙인 서사 + 작가 노트.
      </p>

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">노트</h2>
        <button onClick={refresh} className="text-xs text-indigo-600 hover:underline">새로고침</button>
      </div>
      {notes.length === 0 ? (
        <p className="text-sm text-gray-400">아직 노트가 없습니다. 플레이어가 엔딩에 도달하면 여기에 쌓입니다.</p>
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
                      #{n.runIndex} · {endingLabel(n.endingId)}
                      {n.sourceUserEmail ? ` · ${n.sourceUserEmail}` : ""}
                    </span>
                  </div>
                  <div className="mt-1 truncate">
                    {ready ? (
                      <Link href={`/scenes/feedback-notes/${n._id}`} className="font-medium text-indigo-700 hover:underline">
                        {n.title || "(제목 없음)"}
                      </Link>
                    ) : (
                      <span className="text-gray-500">
                        {n.title || (n.status === "failed" ? (n.error || "생성 실패") : "생성 대기/진행 중")}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => remove(n._id)} className="text-xs text-red-500 hover:underline shrink-0">삭제</button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
