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

// #338 — 가로 리사이즈 핸들.
//   - sm 이상 우측 패널에서만 적용 (sm 미만 = bottom drawer).
//   - localStorage 에 마지막 width 저장 — 다음 mount 시 유지.
//   - min 280 / max window.innerWidth - 200 (그래프 영역 최소 200 px 보장).
const PANEL_WIDTH_KEY = "scenes-graph:side-panel-width";
const DEFAULT_WIDTH = 384; // sm:w-96 와 동등.
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

  // #339 — sm breakpoint (≥640px) 매치 여부 추적. 모바일 시 width inline style
  // 제거 + Tailwind fixed inset 으로 fullscreen.
  const [isSm, setIsSm] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 640px)");
    setIsSm(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsSm(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // #338 — width state + 드래그 핸들 로직.
  // handleMouseDown 안에서 직접 window listener 등록 → closure 로 startX /
  // startWidth 캡처. useEffect deps reattach race + stale closure 차단.
  const [width, setWidth] = useState<number>(() => getInitialWidth());
  const handleHandleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    function onMove(ev: MouseEvent) {
      // 우측 패널 — 마우스가 *왼쪽으로* 이동 = 패널 *더 넓어짐*.
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
  // width 변경 시 localStorage 저장 (디바운스 불필요 — drag 끝의 마지막 값만 유의).
  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_WIDTH_KEY, String(width));
    } catch {
      /* 저장 실패 무시 */
    }
  }, [width]);

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
    // sm 이상 — 우측 사이드. #338 width 는 inline style 로 (sm:w-96 제거).
    "sm:border-l sm:max-h-none sm:h-full sm:static sm:top-auto sm:border-t-0 sm:shadow-none sm:relative " +
    // #339 — sm 미만 (모바일) — fullscreen (네비 제외).
    // top-[60px] = navbar (py-3 + 30px icon ≈ 60px) 아래.
    // sm 이상은 sm:static 으로 position 복원 (handle absolute 의 부모 컨테이닝
    // 위해 sm:relative). 모바일은 fixed 가 활성.
    "fixed top-[60px] bottom-0 left-0 right-0 max-h-none border-t shadow-lg z-20";

  // #338 — 가로 리사이즈 핸들. sm 이상에서만 보임 (sm 미만 = bottom drawer 라 의미 없음).
  // 패널 좌측에 absolute 위치 — 4 px 띠 + hover 시 파란 강조.
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

  // 우측 패널 sm 이상 시 width 적용. sm 미만은 fullscreen (네비 제외) — width 미적용.
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
