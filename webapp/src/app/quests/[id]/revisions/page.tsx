"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { QuestRevisionDocument } from "@/types/quest";

export default function RevisionsPage() {
  const { id } = useParams<{ id: string }>();
  const [revisions, setRevisions] = useState<QuestRevisionDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<number | null>(null);

  async function load() {
    const res = await fetch(`/api/quests/${id}/revisions`);
    const json = await res.json();
    setRevisions(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function restore(version: number) {
    if (!confirm(`버전 ${version}으로 롤백하시겠습니까? 현재 상태는 자동으로 백업됩니다.`)) return;
    setRestoring(version);
    const res = await fetch(`/api/quests/${id}/revisions/${version}/restore`, {
      method: "POST",
    });
    setRestoring(null);
    if (res.ok) {
      alert("롤백 완료");
      load();
    } else {
      const json = await res.json();
      alert(json.message);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/quests/${id}`} className="text-sm text-gray-400 hover:text-gray-600">
          ← 에디터
        </Link>
        <h1 className="text-xl font-bold">버전 히스토리</h1>
      </div>

      {loading ? (
        <p className="text-gray-400">불러오는 중...</p>
      ) : revisions.length === 0 ? (
        <p className="text-gray-400">저장된 버전이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {revisions.map((rev) => (
            <li
              key={rev._id}
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div>
                <span className="font-mono font-bold text-sm">v{rev.version}</span>
                <span className="ml-3 text-xs text-gray-500">
                  {new Date(rev.createdAt).toLocaleString("ko-KR")}
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  페이즈 {Object.keys((rev.quest as { phases?: Record<string, unknown> })?.phases ?? {}).length}개
                </p>
              </div>
              <button
                onClick={() => restore(rev.version)}
                disabled={restoring === rev.version}
                className="px-3 py-1 text-xs rounded border hover:border-orange-400 hover:text-orange-500 disabled:opacity-50"
              >
                {restoring === rev.version ? "롤백 중..." : "이 버전으로 복원"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
