"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Scene } from "@/types/web-adventure";
import { SceneForm } from "./sceneForm";
import { ChoiceEditor } from "./choiceEditor";

interface Props {
  params: Promise<{ id: string }>;
}

export default function SceneEditPage({ params }: Props) {
  const { id } = use(params);
  const router = useRouter();
  const [scene, setScene] = useState<Scene | null>(null);
  const [allSceneIds, setAllSceneIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [oneRes, listRes] = await Promise.all([
          fetch(`/api/web-adventure/scenes/${encodeURIComponent(id)}`),
          fetch(`/api/web-adventure/scenes`),
        ]);
        if (!oneRes.ok) {
          const json = await oneRes.json().catch(() => ({}));
          setError(json.message ?? "씬을 불러올 수 없습니다.");
          setLoading(false);
          return;
        }
        const oneJson = await oneRes.json();
        const listJson = await listRes.json();
        setScene(oneJson.data);
        const ids: string[] = ((listJson.data as Scene[]) ?? []).map((s) => s.id).sort();
        setAllSceneIds(ids);
      } catch (e) {
        setError(e instanceof Error ? e.message : "오류 발생");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSave() {
    if (!scene) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/web-adventure/scenes/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scene),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.message ?? "저장 실패");
      } else {
        // 응답 body 의 갱신된 scene 으로 state 갱신 — revisionCount UI 즉시 반영.
        // 사용자 보고 #revisionCount-stale fix.
        const json = (await res.json().catch(() => ({}))) as { data?: Scene };
        if (json.data) setScene(json.data);
        setSavedAt(new Date().toLocaleTimeString("ko-KR"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!scene) return;
    if (!window.confirm(`"${scene.title}" (${scene.id}) 씬을 삭제하시겠습니까?\n되돌릴 수 없습니다.`)) {
      return;
    }
    const res = await fetch(`/api/web-adventure/scenes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      router.push("/scenes");
    } else {
      const json = await res.json().catch(() => ({}));
      setError(json.message ?? "삭제 실패");
    }
  }

  if (loading) {
    return <div className="mx-auto px-4 py-6"><p className="text-gray-400">불러오는 중...</p></div>;
  }
  if (error && !scene) {
    return (
      <div className="mx-auto px-4 py-6 space-y-3">
        <p className="text-red-500">{error}</p>
        <Link href="/scenes" className="text-sm text-blue-500 hover:underline">← 씬 목록</Link>
      </div>
    );
  }
  if (!scene) return null;

  return (
    <div className="mx-auto px-4 py-6 max-w-4xl space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Link href="/scenes" className="text-xs text-blue-500 hover:underline">← 씬 목록</Link>
          <h1 className="text-2xl font-bold mt-1">씬 편집 — <span className="font-mono">{scene.id}</span></h1>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && <span className="text-xs text-gray-500">{savedAt} 저장됨</span>}
          {/* 옛 quest CMS 패턴 — 리비전 보기: 별도 페이지로 이동. */}
          <Link
            href={`/scenes/${encodeURIComponent(scene.id)}/revisions`}
            className="px-3 py-1.5 text-sm rounded border border-amber-300 text-amber-700 dark:text-amber-300 hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950"
          >
            리비전 보기 ({(scene as typeof scene & { revisionCount?: number }).revisionCount ?? 0}개)
          </Link>
          {/* #341 — 차트 보기: graph 페이지로 이동 + 해당 노드 focus + zoom 1.2 + 패널 자동 오픈. */}
          <Link
            href={`/scenes/graph?focus=${encodeURIComponent(scene.id)}`}
            className="px-3 py-1.5 text-sm rounded border border-blue-300 text-blue-600 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950"
          >
            차트에서 보기
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="px-3 py-1.5 text-sm rounded border border-red-300 text-red-500 hover:border-red-500 hover:text-red-700"
          >
            삭제
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <SceneForm scene={scene} onChange={setScene} />

      <section>
        <h2 className="text-lg font-semibold mb-2">선택지 (choices)</h2>
        <ChoiceEditor
          choices={scene.choices ?? []}
          onChange={(choices) => setScene({ ...scene, choices })}
          allSceneIds={allSceneIds}
        />
      </section>
    </div>
  );
}
