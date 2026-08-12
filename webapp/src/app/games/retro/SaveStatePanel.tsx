"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBytes } from "@/lib/retro/entry";

interface SaveMeta {
  size: number;
  hasShot: boolean;
  updatedAt: string;
}

/**
 * 서버 세이브 현황 (#114).
 *
 * **저장·불러오기 버튼을 여기 만들지 않는다.** 그건 에뮬레이터의 네이티브 버튼이 한다
 * (`player.html` 이 `EJS_onSaveState`/`EJS_onLoadState` 로 서버에 연결해 뒀다).
 * 이 패널은 "지금 무엇이 저장돼 있는지" 를 보여 주고 지우는 일만 한다.
 */
export default function SaveStatePanel({ gameKey }: { gameKey: string }) {
  const [meta, setMeta] = useState<SaveMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/retro/states?game=${encodeURIComponent(gameKey)}`);
      const body = await res.json().catch(() => null);
      setMeta(res.ok ? (body?.data ?? null) : null);
    } catch {
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [gameKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/games/retro/states?game=${encodeURIComponent(gameKey)}`, { method: "DELETE" });
      if (res.ok) setMeta(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          서버 세이브
        </h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="text-xs text-gray-500 underline transition hover:text-blue-600 disabled:opacity-50 dark:text-gray-400 dark:hover:text-blue-400"
        >
          새로고침
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">확인 중…</p>
      ) : meta ? (
        <div className="flex items-center gap-3">
          {meta.hasShot && (
            // 저장 순간의 화면. next/image 를 쓰지 않는다 — 인증이 필요한 사설 경로라
            // 최적화 서버가 대신 받아 올 수 없다.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/games/retro/states/shot?game=${encodeURIComponent(gameKey)}`}
              alt=""
              className="h-14 w-auto shrink-0 rounded border border-gray-300 dark:border-gray-600"
            />
          )}
          <div className="min-w-0 flex-1 text-sm text-gray-700 dark:text-gray-300">
            <p>{new Date(meta.updatedAt).toLocaleString("ko-KR")} 저장</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{formatBytes(meta.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="shrink-0 rounded px-2 py-1 text-xs text-gray-500 transition hover:bg-red-600 hover:text-white disabled:opacity-50 dark:text-gray-400"
          >
            삭제
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">아직 저장된 상태가 없습니다.</p>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
        화면 아래 에뮬레이터 막대의 <strong>Save State</strong> · <strong>Load State</strong> 버튼이
        이 자리에 저장하고 불러옵니다. 게임당 한 개이며, 저장하면 이전 것을 덮어씁니다.
      </p>
    </section>
  );
}
