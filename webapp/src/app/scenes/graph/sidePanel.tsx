// SidePanel — /scenes/graph 우측 인라인 편집 패널.
//
// #226 — /scenes/[id] 페이지로 라우팅하지 않고 같은 컴포넌트들을
// (sceneForm / choiceEditor / conditionBuilder) 재사용해 우측 패널에서 편집.
//
// #231 — bevy-rogue quest CMS 패턴 회수.
//   - sceneId=null 시 → null 반환 (DOM 미렌더). 안내 메시지 제거.
//   - 부모 (/scenes/graph/page.tsx) 가 `{selectedSceneId && <SidePanel ... />}`
//     로 조건부 렌더 (= mount/unmount) 하며, 첫 mount 시 slide-in 애니메이션을
//     주기 위해 패널 자체에 transition + translate-x 토글을 둔다.
//
// 동작:
//   - sceneId 설정     → /api/web-adventure/scenes/[id] 로 로드 → 폼 + 선택지 편집.
//   - 저장 버튼        → PUT → onSaved 콜백 (page 의 nodes data 갱신).
//   - 닫기 버튼        → onClose 콜백.
//
// 반응형 (MVP):
//   - sm 이상: 우측 고정 패널 (w-96).
//   - sm 미만: bottom drawer (화면 하단 max-h-[80vh] overflow-y-auto).

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
  // #231 — sceneId=null 시 컴포넌트 자체를 mount 하지 않는다 (bevy-rogue 패턴).
  // 부모가 `{selectedSceneId && <SidePanel ... />}` 로 가드해도, 직접 호출자
  // 안전망으로 같은 분기를 유지한다.
  const [scene, setScene] = useState<Scene | null>(null);
  const [allSceneIds, setAllSceneIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // #231 — mount 직후 slide-in 을 위해 첫 paint 후 translate-x 를 0 으로 토글.
  const [slidIn, setSlidIn] = useState(false);
  useEffect(() => {
    if (!sceneId) {
      setSlidIn(false);
      return;
    }
    // 다음 frame 에서 transition 효과로 들어오게 한다.
    const raf = requestAnimationFrame(() => setSlidIn(true));
    return () => cancelAnimationFrame(raf);
  }, [sceneId]);

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
  // #231 — sceneId=null → null 반환 (DOM 미렌더). 부모가 mount/unmount.
  // 안내 메시지 제거.
  if (!sceneId) {
    return null;
  }

  // 슬라이드인 transition (300ms ease-out).
  // sm 이상 → 우측에서 들어옴 (translate-x-full → translate-x-0).
  // sm 미만 → 하단에서 올라옴 (translate-y-full → translate-y-0).
  const slideClass = slidIn
    ? "translate-x-0 translate-y-0"
    : "translate-x-0 translate-y-full sm:translate-x-full sm:translate-y-0";
  const baseAside =
    "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 overflow-y-auto " +
    "transition-transform duration-300 ease-out " +
    slideClass +
    " " +
    // sm 이상 — 우측 사이드.
    "sm:border-l sm:w-96 sm:max-h-none sm:h-full sm:static " +
    // sm 미만 — bottom drawer.
    "fixed bottom-0 left-0 right-0 max-h-[80vh] border-t sm:border-t-0 shadow-lg sm:shadow-none z-20";

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
