"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Scene } from "@/types/web-adventure";

export default function ScenesPage() {
  const router = useRouter();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/web-adventure/scenes");
    const json = await res.json();
    setScenes(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return scenes;
    const q = query.trim().toLowerCase();
    return scenes.filter((s) =>
      s.id.toLowerCase().includes(q) || s.title.toLowerCase().includes(q),
    );
  }, [scenes, query]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!newId.trim() || !newTitle.trim()) {
      setCreateError("ID 와 제목을 입력하세요.");
      return;
    }
    const res = await fetch("/api/web-adventure/scenes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: newId.trim(),
        title: newTitle.trim(),
        illustration: "",
        body: [""],
        choices: [],
      }),
    });
    if (res.ok) {
      setCreating(false);
      setNewId("");
      setNewTitle("");
      router.push(`/scenes/${encodeURIComponent(newId.trim())}`);
    } else {
      const json = await res.json().catch(() => ({}));
      setCreateError(json.message ?? "씬 생성 실패");
    }
  }

  async function handleDelete(scene: Scene) {
    if (!window.confirm(`"${scene.title}" (${scene.id}) 씬을 삭제하시겠습니까?\n되돌릴 수 없습니다.`)) {
      return;
    }
    const res = await fetch(`/api/web-adventure/scenes/${encodeURIComponent(scene.id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      load();
    } else {
      const json = await res.json().catch(() => ({}));
      window.alert(json.message ?? "삭제 실패");
    }
  }

  return (
    <div className="mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">씬 목록</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/scenes/graph"
            className="px-3 py-2 text-sm rounded-lg border border-gray-400 hover:border-blue-400 hover:text-blue-500"
            aria-label="씬 차트 보기"
          >
            차트 보기
          </Link>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="px-3 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            + 새 씬
          </button>
        </div>
      </div>

      <div className="mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="씬 검색 (id 또는 제목)"
          className="w-full md:w-96 border rounded px-3 py-2 text-sm bg-white dark:bg-gray-800"
        />
      </div>

      {creating && (
        <form
          onSubmit={handleCreate}
          className="mb-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900 flex gap-2 items-end flex-wrap"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">씬 ID</label>
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="scene_intro"
              className="border rounded px-2 py-1 text-sm w-40 bg-white dark:bg-gray-800"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">제목</label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="씬 제목"
              className="border rounded px-2 py-1 text-sm w-56 bg-white dark:bg-gray-800"
            />
          </div>
          <button type="submit" className="px-3 py-1 text-sm rounded bg-blue-600 text-white">
            생성
          </button>
          <button
            type="button"
            onClick={() => { setCreating(false); setCreateError(null); }}
            className="px-3 py-1 text-sm rounded border"
          >
            취소
          </button>
          {createError && <p className="w-full text-xs text-red-500">{createError}</p>}
        </form>
      )}

      {loading ? (
        <p className="text-gray-400">불러오는 중...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400">표시할 씬이 없습니다.</p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((s) => (
            <li
              key={s.id}
              data-scene-row
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/scenes/${encodeURIComponent(s.id)}`}
                  className="font-medium hover:text-blue-500 block truncate"
                >
                  {s.title || <span className="italic text-gray-400">(제목 없음)</span>}
                </Link>
                <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                  <span className="font-mono">{s.id}</span>
                  <span>·</span>
                  <span>선택지 {s.choices?.length ?? 0}</span>
                  {s.isEnding && (
                    <>
                      <span>·</span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                        엔딩{s.endingId ? ` (${s.endingId})` : ""}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Link
                  href={`/scenes/${encodeURIComponent(s.id)}`}
                  className="px-2 py-1 text-xs rounded border hover:border-blue-400 hover:text-blue-500 transition-colors"
                >
                  편집
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(s)}
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
