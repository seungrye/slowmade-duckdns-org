// SidePanel - /scenes/graph's right-hand inline editing panel.
//
// #226 - instead of routing to the /scenes/[id] page, the same components
// (sceneForm / choiceEditor / conditionBuilder) are reused to edit in the right-hand panel.
//
// #231 - reclaiming the bevy-rogue quest CMS pattern.
//   - with sceneId=null it returns null (no DOM rendered). The hint message is gone.
//   - the parent (/scenes/graph/page.tsx) renders it conditionally with `{selectedSceneId && <SidePanel ... />}`
//     (= mount/unmount), and the panel itself carries a transition plus a translate-x toggle so the
//     first mount slides in.
//
// How it works:
//   - a set sceneId  -> loads from /api/web-adventure/scenes/[id] -> the form plus choice editing.
//   - the save button -> a PUT -> the onSaved callback (updating the page's node data).
//   - the close button -> the onClose callback.
//
// Responsive (MVP):
//   - sm and up: a fixed right-hand panel (w-96).
//   - below sm: a bottom drawer (max-h-[80vh] overflow-y-auto at the foot of the screen).

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

// #338 - the horizontal resize handle.
//   - applies only to the right-hand panel at sm and up (below sm it is a bottom drawer).
//   - the last width is stored in localStorage - kept on the next mount.
//   - min 280 / max window.innerWidth - 200 (guaranteeing the graph area at least 200px).
const PANEL_WIDTH_KEY = "scenes-graph:side-panel-width";
const DEFAULT_WIDTH = 384; // Equivalent to sm:w-96.
const MIN_WIDTH = 280;
function getInitialWidth(): number {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const saved = window.localStorage.getItem(PANEL_WIDTH_KEY);
  const n = saved ? parseInt(saved, 10) : NaN;
  if (!Number.isFinite(n) || n < MIN_WIDTH) return DEFAULT_WIDTH;
  return n;
}
function clampWidth(w: number): number {
  const max = typeof window === "undefined" ? 1600 : Math.max(MIN_WIDTH, window.innerWidth - 200);
  return Math.min(Math.max(MIN_WIDTH, w), max);
}

export function SidePanel({ sceneId, onClose, onSaved }: Props) {
  // #231 - with sceneId=null the component itself is not mounted (the bevy-rogue pattern).
  // The parent guards with `{selectedSceneId && <SidePanel ... />}`, but the same branch is kept
  // as a safety net for a direct caller.
  const [scene, setScene] = useState<Scene | null>(null);
  const [allSceneIds, setAllSceneIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // #231 - translate-x toggles to 0 after the first paint so it slides in right after mounting.
  const [slidIn, setSlidIn] = useState(false);
  useEffect(() => {
    if (!sceneId) {
      setSlidIn(false);
      return;
    }
    // It comes in with the transition on the next frame.
    const raf = requestAnimationFrame(() => setSlidIn(true));
    return () => cancelAnimationFrame(raf);
  }, [sceneId]);

  // #339 - tracking whether the sm breakpoint (>=640px) matches. On mobile the inline width style
  // is dropped and Tailwind's fixed inset makes it fullscreen.
  const [isSm, setIsSm] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 640px)");
    setIsSm(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsSm(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // #338 - the width state plus the drag handle logic.
  // The window listeners are registered inside handleMouseDown so the closure captures startX and
  // startWidth. That blocks the useEffect deps reattach race and a stale closure.
  const [width, setWidth] = useState<number>(() => getInitialWidth());
  const handleHandleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    function onMove(ev: MouseEvent) {
      // The right-hand panel - moving the mouse *left* makes the panel *wider*.
      const dx = startX - ev.clientX;
      setWidth(clampWidth(startWidth + dx));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
  // A changed width is stored in localStorage (no debounce needed - only the last value at the end of a drag matters).
  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_WIDTH_KEY, String(width));
    } catch {
      /* 저장 실패 무시 */
    }
  }, [width]);

  // Fetches when sceneId changes.
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
          fetch(`/api/web-adventure/scenes/${encodeURIComponent(sceneId)}`, {
            cache: "no-store",
          }),
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

  // -- rendering ------------------------------------------------------------
  // #231 - sceneId=null -> returns null (no DOM rendered). The parent mounts and unmounts.
  // The hint message is gone.
  if (!sceneId) {
    return null;
  }

  // The slide-in transition (300ms ease-out).
  // sm and up -> it comes in from the right (translate-x-full -> translate-x-0).
  // below sm -> it rises from the bottom (translate-y-full -> translate-y-0).
  const slideClass = slidIn
    ? "translate-x-0 translate-y-0"
    : "translate-x-0 translate-y-full sm:translate-x-full sm:translate-y-0";
  const baseAside =
    "bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 overflow-y-auto " +
    "transition-transform duration-300 ease-out " +
    slideClass +
    " " +
    // sm and up - the right-hand side. #338's width is an inline style (sm:w-96 is gone).
    "sm:border-l sm:max-h-none sm:h-full sm:static sm:top-auto sm:border-t-0 sm:shadow-none sm:relative " +
    // #339 - below sm (mobile) - fullscreen (excluding the nav).
    // top-[60px] = below the navbar (py-3 plus a 30px icon, about 60px).
    // sm and up restores the position with sm:static (sm:relative so the absolute handle has a
    // containing parent). On mobile the fixed positioning is active.
    "fixed top-[60px] bottom-0 left-0 right-0 max-h-none border-t shadow-lg z-20";

  // #338 - the horizontal resize handle. Visible at sm and up only (below sm it is a bottom drawer, so it means nothing).
  // Positioned absolutely at the panel's left - a 4px strip with a blue highlight on hover.
  const ResizeHandle = (
    <div
      data-testid="side-panel-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label="패널 가로 크기 조절"
      onMouseDown={handleHandleMouseDown}
      className="hidden sm:block absolute -left-1 top-0 bottom-0 w-3 cursor-col-resize bg-transparent hover:bg-blue-400/40 active:bg-blue-500/60 z-30"
    />
  );

  // The width applies to the right-hand panel at sm and up. Below sm it is fullscreen (excluding the nav) - no width applied.
  const widthStyle: React.CSSProperties | undefined = isSm
    ? { width: `${width}px` }
    : undefined;

  if (loading) {
    return (
      <aside
        data-testid="side-panel"
        data-scene-id={sceneId}
        className={baseAside + " p-4"}
        style={widthStyle}
      >
        {ResizeHandle}
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
        style={widthStyle}
      >
        {ResizeHandle}
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
        style={widthStyle}
      >
        {ResizeHandle}
        <p className="text-sm text-gray-500">씬을 찾을 수 없습니다.</p>
      </aside>
    );
  }

  return (
    <aside
      data-testid="side-panel"
      data-scene-id={sceneId}
      className={baseAside + " p-4 space-y-3"}
      style={widthStyle}
    >
      {ResizeHandle}
      {/* #340 — sticky 제거: 스크롤 시 헤더가 화면에 *따라붙어 따라오는* 동작이
       어색하다는 피드백. 일반 흐름으로 — 스크롤 후 header 사라짐. */}
      <header className="flex items-center justify-between gap-2 bg-white dark:bg-gray-900 pb-2 border-b border-gray-200 dark:border-gray-700">
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
