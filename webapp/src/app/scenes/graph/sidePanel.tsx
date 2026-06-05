// SidePanel — /scenes/graph 우측 인라인 편집 패널.
//
// #226 — /scenes/[id] 페이지로 라우팅하지 않고 같은 컴포넌트들을
// (sceneForm / choiceEditor / conditionBuilder) 재사용해 우측 패널에서 편집.
//
// 동작:
//   - sceneId=null     → 안내 메시지.
//   - sceneId 설정     → /api/web-adventure/scenes/[id] 로 로드 → 폼 + 선택지 편집.
//   - 저장 버튼        → PUT → onSaved 콜백 (page 의 nodes data 갱신).
//   - 닫기 버튼        → onClose 콜백.
//
// 반응형 (MVP):
//   - sm 이상: 우측 고정 패널 (w-96).
//   - sm 미만: bottom drawer (화면 하단 max-h-[80vh] overflow-y-auto).
//     sceneId 가 있을 때만 drawer 가 펼쳐지도록 transform 으로 토글.

"use client";

import { useEffect, useState } from "react";
import type { Scene } from "@/types/web-adventure";
import { SceneForm } from "../[id]/sceneForm";
import { ChoiceEditor } from "../[id]/choiceEditor";

interface Props {
  sceneId: string | null;
  onClose: () => void;
  onSaved: (scene: Scene) => void;
}

export function SidePanel({ sceneId, onClose, onSaved }: Props) {
  const [scene, setScene] = useState<Scene | null>(null);
  const [allSceneIds, setAllSceneIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // sceneId 변경 시 fetch.
  useEffect(() => {
    if (!sceneId) {
      setScene(null);
      setError(null);
      setSavedAt(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSavedAt(null);
    (async () => {
      try {
        const [oneRes, listRes] = await Promise.all([
          fetch(`/api/web-adventure/scenes/${encodeURIComponent(sceneId)}`),
          fetch(`/api/web-adventure/scenes`),
        ]);
        if (!oneRes.ok) {
          const json = await oneRes.json().catch(() => ({} as { message?: string }));
          if (!cancelled) {
            setError((json as { message?: string }).message ?? "씬을 불러올 수 없습니다.");
            setScene(null);
          }
          return;
        }
        const oneJson = (await oneRes.json()) as { data?: Scene };
        const listJson = (await listRes.json().catch(() => ({}))) as {
          data?: Scene[];
        };
        if (!cancelled) {
          setScene(oneJson.data ?? null);
          const ids = (listJson.data ?? []).map((s) => s.id).sort();
          setAllSceneIds(ids);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "오류 발생");
          setScene(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sceneId]);

  async function handleSave() {
    if (!sceneId || !scene) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/web-adventure/scenes/${encodeURIComponent(sceneId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scene),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        setError(json.message ?? "저장 실패");
      } else {
        setSavedAt(new Date().toLocaleTimeString("ko-KR"));
        onSaved(scene);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  // ── 렌더링 ──────────────────────────────────────────────────────────────────
  // 컨테이너는 항상 sceneId 속성 + data-testid 제공 (테스트 식별).
  // sm 이상: side panel. sm 미만: bottom drawer.

  const baseAside =
    "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 overflow-y-auto " +
    // sm 이상 — 우측 사이드.
    "sm:border-l sm:w-96 sm:max-h-none sm:h-full sm:static " +
    // sm 미만 — bottom drawer.
    "fixed bottom-0 left-0 right-0 max-h-[80vh] border-t sm:border-t-0 shadow-lg sm:shadow-none z-20";

  if (!sceneId) {
    return (
      <aside
        data-testid="side-panel"
        data-scene-id=""
        className={baseAside + " p-4 hidden sm:block"}
      >
        <p className="text-sm text-gray-500">노드를 클릭하면 편집할 수 있어요.</p>
      </aside>
    );
  }

  if (loading) {
    return (
      <aside
        data-testid="side-panel"
        data-scene-id={sceneId}
        className={baseAside + " p-4"}
      >
        <p className="text-sm text-gray-400">불러오는 중...</p>
      </aside>
    );
  }

  if (error && !scene) {
    return (
      <aside
        data-testid="side-panel"
        data-scene-id={sceneId}
        className={baseAside + " p-4 space-y-2"}
      >
        <p className="text-sm text-red-500">{error}</p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-blue-500 hover:underline"
        >
          닫기
        </button>
      </aside>
    );
  }

  if (!scene) {
    return (
      <aside
        data-testid="side-panel"
        data-scene-id={sceneId}
        className={baseAside + " p-4"}
      >
        <p className="text-sm text-gray-500">씬을 찾을 수 없습니다.</p>
      </aside>
    );
  }

  return (
    <aside
      data-testid="side-panel"
      data-scene-id={sceneId}
      className={baseAside + " p-4 space-y-3"}
    >
      <header className="flex items-center justify-between gap-2 sticky top-0 bg-white dark:bg-gray-900 pb-2 border-b border-gray-200 dark:border-gray-700">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold truncate" title={scene.title}>
            {scene.title || "(제목 없음)"}
          </h2>
          <p className="text-[10px] font-mono text-gray-500 truncate">{scene.id}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {savedAt && <span className="text-[10px] text-gray-500">{savedAt} 저장</span>}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            닫기 ✕
          </button>
        </div>
      </header>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <SceneForm scene={scene} onChange={setScene} />

      <section>
        <h3 className="text-xs font-semibold mb-1 text-gray-600 dark:text-gray-300">
          선택지 (choices)
        </h3>
        <ChoiceEditor
          choices={scene.choices ?? []}
          onChange={(choices) => setScene({ ...scene, choices })}
          allSceneIds={allSceneIds}
        />
      </section>
    </aside>
  );
}
