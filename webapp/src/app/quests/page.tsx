"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { QuestDocument } from "@/types/quest";
import { useInfoDialog } from "@/components/info-dialog";

export default function QuestsPage() {
  const [quests, setQuests] = useState<QuestDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSpawn, setBulkSpawn] = useState("1.0");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const { showInfo } = useInfoDialog();

  async function load() {
    const res = await fetch("/api/quests");
    const json = await res.json();
    setQuests(json.data ?? []);
    setSelectedIds(new Set());
    setLoading(false);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const all = quests.length > 0 && quests.every((q) => prev.has(q._id));
      const next = new Set(prev);
      if (all) for (const q of quests) next.delete(q._id);
      else for (const q of quests) next.add(q._id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size}개 퀘스트를 삭제하시겠습니까?`)) return;
    setBulkDeleting(true);
    const res = await fetch("/api/quests/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    setBulkDeleting(false);
    if (res.ok) {
      const { data } = await res.json();
      showInfo({ title: "일괄 삭제 완료", body: `${data.deleted}개 퀘스트 삭제.`, variant: "success" });
      load();
    } else {
      const json = await res.json().catch(() => ({}));
      showInfo({ title: "일괄 삭제 실패", body: json.message ?? "알 수 없는 오류", variant: "error" });
    }
  }

  async function handleBulkSpawn(e: React.FormEvent) {
    e.preventDefault();
    const sc = Number(bulkSpawn);
    if (!Number.isFinite(sc) || sc < 0 || sc > 1) {
      showInfo({ title: "값 오류", body: "0.0~1.0 사이 숫자여야 합니다.", variant: "error" });
      return;
    }
    if (selectedIds.size === 0) return;
    setBulkSubmitting(true);
    const res = await fetch("/api/quests/bulk-update-spawn-chance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds), spawnChance: sc }),
    });
    setBulkSubmitting(false);
    if (res.ok) {
      const { data } = await res.json();
      setBulkOpen(false);
      showInfo({ title: "일괄 변경 완료", body: `${data.updated}개 퀘스트 갱신.`, variant: "success" });
      load();
    } else {
      const json = await res.json().catch(() => ({}));
      showInfo({ title: "일괄 변경 실패", body: json.message ?? "알 수 없는 오류", variant: "error" });
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newId.trim() || !newTitle.trim()) return;
    const res = await fetch("/api/quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: newId.trim(), title: newTitle.trim() }),
    });
    if (res.ok) {
      setCreating(false);
      setNewId("");
      setNewTitle("");
      load();
    } else {
      const json = await res.json();
      showInfo({ title: "퀘스트 생성 실패", body: json.message ?? "알 수 없는 오류", variant: "error" });
    }
  }

  async function handleDelete(quest: QuestDocument) {
    if (!confirm(`"${quest.title}" 퀘스트를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    await fetch(`/api/quests/${quest._id}`, { method: "DELETE" });
    load();
  }

  async function handleImport(questId: string, file: File) {
    const text = await file.text();
    const res = await fetch(`/api/quests/${questId}/import`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: text,
    });
    if (res.ok) {
      load();
    } else {
      const json = await res.json();
      showInfo({ title: "임포트 실패", body: json.message ?? "알 수 없는 오류", variant: "error" });
    }
  }

  async function handleNewImport(file: File) {
    const text = await file.text();
    // 신규 퀘스트로 import: 먼저 빈 퀘스트 생성 후 import
    const parsed = text.match(/id:\s*"([^"]+)"/);
    const id = parsed?.[1];
    const titleParsed = text.match(/title:\s*"([^"]+)"/);
    const title = titleParsed?.[1] ?? id ?? "imported";
    if (!id) {
      showInfo({ title: "임포트 실패", body: "RON 파일에서 id를 찾을 수 없습니다.", variant: "error" });
      return;
    }

    const createRes = await fetch("/api/quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    });
    if (!createRes.ok) {
      const json = await createRes.json();
      showInfo({ title: "퀘스트 생성 실패", body: json.message ?? "알 수 없는 오류", variant: "error" });
      return;
    }
    const { data: created } = await createRes.json();

    const importRes = await fetch(`/api/quests/${created._id}/import`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: text,
    });
    if (importRes.ok) {
      load();
    } else {
      const json = await importRes.json();
      showInfo({ title: "임포트 실패", body: json.message ?? "알 수 없는 오류", variant: "error" });
    }
  }

  return (
    <div className="mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">퀘스트 목록</h1>
        <div className="flex gap-2 flex-wrap items-center">
          <label className="cursor-pointer px-3 py-2 text-sm rounded-lg border border-dashed border-gray-400 hover:border-blue-500 hover:text-blue-500 transition-colors">
            .ron 가져오기
            <input
              ref={importRef}
              type="file"
              accept=".ron"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleNewImport(file);
                e.target.value = "";
              }}
            />
          </label>
          <button
            onClick={() => setCreating(true)}
            className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            + 새 퀘스트
          </button>
        </div>
      </div>

      {quests.length > 0 && (
        <div className="flex items-center gap-3 mb-3 text-sm flex-wrap">
          <label className="flex items-center gap-1 text-gray-600 dark:text-gray-400 select-none cursor-pointer">
            <input
              type="checkbox"
              checked={quests.every((q) => selectedIds.has(q._id))}
              onChange={toggleSelectAll}
              aria-label="전체 선택"
            />
            전체 선택
          </label>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={bulkDeleting || selectedIds.size === 0}
            className="px-3 py-1 rounded border border-red-300 text-red-500 hover:border-red-500 hover:text-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {bulkDeleting ? "삭제 중..." : `선택 삭제 (${selectedIds.size})`}
          </button>
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            disabled={selectedIds.size === 0}
            className="px-3 py-1 rounded border border-purple-300 text-purple-500 hover:border-purple-500 hover:text-purple-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            spawn 일괄 변경 ({selectedIds.size})
          </button>
        </div>
      )}

      {creating && (
        <form
          onSubmit={handleCreate}
          className="mb-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900 flex gap-2 items-end"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">퀘스트 ID</label>
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="stark_quest"
              className="border rounded px-2 py-1 text-sm w-40"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">제목</label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="전쟁의 서막"
              className="border rounded px-2 py-1 text-sm w-48"
            />
          </div>
          <button type="submit" className="px-3 py-1 text-sm rounded bg-blue-600 text-white">
            생성
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="px-3 py-1 text-sm rounded border"
          >
            취소
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-gray-400">불러오는 중...</p>
      ) : quests.length === 0 ? (
        <p className="text-gray-400">퀘스트가 없습니다.</p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {quests.map((q) => (
            <li
              key={q._id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedIds.has(q._id)}
                  onChange={() => toggleSelect(q._id)}
                  aria-label={`${q.title} 선택`}
                  className="mt-1 shrink-0"
                />
                <div className="min-w-0">
                <Link href={`/quests/${q._id}`} className="font-medium hover:text-blue-500 block">
                  {q.title}
                </Link>
                <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                  <span>{q.id}</span>
                  <span>·</span>
                  <span>v{q.version}</span>
                  <span>·</span>
                  <span>{new Date(q.updatedAt).toLocaleDateString("ko-KR")}</span>
                  <span>·</span>
                  <span
                    className="font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800"
                    title="이번 런에서 이 퀘스트가 활성화될 확률 (0.0~1.0)"
                  >
                    스폰 {(q.spawnChance ?? 1.0).toFixed(2)}
                  </span>
                </p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <label className="cursor-pointer px-2 py-1 text-xs rounded border hover:border-blue-400 hover:text-blue-500 transition-colors">
                  import
                  <input
                    type="file"
                    accept=".ron"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImport(q._id, file);
                      e.target.value = "";
                    }}
                  />
                </label>
                <a
                  href={`/api/quests/${q._id}/export`}
                  className="px-2 py-1 text-xs rounded border hover:border-green-400 hover:text-green-600 transition-colors"
                >
                  export
                </a>
                <Link
                  href={`/quests/${q._id}`}
                  className="px-2 py-1 text-xs rounded border hover:border-blue-400 hover:text-blue-500 transition-colors"
                >
                  편집
                </Link>
                <button
                  onClick={() => handleDelete(q)}
                  className="px-2 py-1 text-xs rounded border border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 transition-colors"
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* spawn 일괄 변경 모달 */}
      {bulkOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => !bulkSubmitting && setBulkOpen(false)}
        >
          <form
            onSubmit={handleBulkSpawn}
            onClick={(e) => e.stopPropagation()}
            className="w-80 p-4 rounded-lg bg-white dark:bg-gray-900 border shadow-xl space-y-3"
          >
            <h2 className="text-lg font-semibold">spawn 확률 일괄 변경</h2>
            <p className="text-xs text-gray-500">선택한 {selectedIds.size}개 퀘스트의 spawnChance 를 같은 값으로 설정합니다.</p>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">spawnChance (0.0 ~ 1.0)</span>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={bulkSpawn}
                onChange={(e) => setBulkSpawn(e.target.value)}
                className="border rounded px-2 py-1 text-sm font-mono"
                autoFocus
              />
            </label>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setBulkOpen(false)}
                disabled={bulkSubmitting}
                className="px-3 py-1 text-sm rounded border"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={bulkSubmitting}
                className="px-3 py-1 text-sm rounded bg-purple-600 text-white disabled:opacity-50"
              >
                {bulkSubmitting ? "적용 중..." : "적용"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
