"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { ItemRevisionDocument } from "@/types/item";
import { useInfoDialog } from "@/components/info-dialog";

export default function ItemRevisionsPage() {
  const { id } = useParams<{ id: string }>();
  const decoded = decodeURIComponent(id);
  const [revisions, setRevisions] = useState<ItemRevisionDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<number | null>(null);
  const { showInfo } = useInfoDialog();

  const load = useCallback(async () => {
    const res = await fetch(`/api/quests/items/${id}/revisions`);
    const json = await res.json();
    setRevisions(json.data ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function restore(version: number) {
    if (!confirm(`버전 ${version}으로 롤백하시겠습니까? 현재 상태는 자동으로 백업됩니다.`)) return;
    setRestoring(version);
    const res = await fetch(`/api/quests/items/${id}/revisions/${version}/restore`, {
      method: "POST",
    });
    setRestoring(null);
    if (res.ok) {
      showInfo({ title: "롤백 완료", body: `버전 ${version}으로 복원되었습니다.`, variant: "success" });
      load();
    } else {
      const json = await res.json();
      showInfo({ title: "롤백 실패", body: json.message ?? "알 수 없는 오류", variant: "error" });
    }
  }

  function summary(item: ItemRevisionDocument["item"]): string {
    switch (item.kind) {
      case "quest":      return `image: ${item.imagePath}`;
      case "weapon":     return `ATK ${item.attackPower}${item.element ? ` (${item.element})` : ""}`;
      case "armor":      return `DEF +${item.defenseBonus}`;
      case "consumable": return `${item.effect.type} +${item.effect.amount}`;
      case "accessory":  return item.desc;
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/quests/items" className="text-sm text-gray-400 hover:text-gray-600">
          ← 카탈로그
        </Link>
        <h1 className="text-xl font-bold">{decoded} — 버전 히스토리</h1>
      </div>

      {loading ? (
        <p className="text-gray-400">불러오는 중...</p>
      ) : revisions.length === 0 ? (
        <p className="text-gray-400">저장된 이전 버전이 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {revisions.map((rev) => (
            <li key={rev._id} className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <span className="font-mono font-bold text-sm">v{rev.version}</span>
                <span className="ml-3 text-xs text-gray-500">
                  {new Date(rev.createdAt).toLocaleString("ko-KR")}
                </span>
                <p className="text-xs text-gray-400 mt-0.5">
                  {rev.item.displayName} · {summary(rev.item)}
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
