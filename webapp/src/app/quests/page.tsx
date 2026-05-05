"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { QuestDocument } from "@/types/quest";

export default function QuestsPage() {
  const [quests, setQuests] = useState<QuestDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/quests");
    const json = await res.json();
    setQuests(json.data ?? []);
    setLoading(false);
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
      alert(json.message);
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
      alert(json.message);
    }
  }

  async function handleNewImport(file: File) {
    const text = await file.text();
    // 신규 퀘스트로 import: 먼저 빈 퀘스트 생성 후 import
    const parsed = text.match(/id:\s*"([^"]+)"/);
    const id = parsed?.[1];
    const titleParsed = text.match(/title:\s*"([^"]+)"/);
    const title = titleParsed?.[1] ?? id ?? "imported";
    if (!id) { alert("RON 파일에서 id를 찾을 수 없습니다."); return; }

    const createRes = await fetch("/api/quests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title }),
    });
    if (!createRes.ok) {
      const json = await createRes.json();
      alert(json.message);
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
      alert(json.message);
    }
  }

  return (
    <div className="mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">퀘스트 목록</h1>
        <div className="flex gap-2">
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
              <div>
                <Link href={`/quests/${q._id}`} className="font-medium hover:text-blue-500 block">
                  {q.title}
                </Link>
                <p className="text-xs text-gray-500 mt-0.5">
                  {q.id} · v{q.version} · {new Date(q.updatedAt).toLocaleDateString("ko-KR")}
                </p>
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
    </div>
  );
}
