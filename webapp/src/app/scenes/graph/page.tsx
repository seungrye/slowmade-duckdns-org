// /scenes/graph — ReactFlow + dagre 편집 차트 페이지.
//
// #222 (6 주차):
//   - 30 씬 fetch (/api/web-adventure/content/v1)
//   - dagre TB 자동 레이아웃 (savedPosition 있는 노드는 유지)
//   - 노드 클릭 → /scenes/[id] 이동 (편집 페이지) — #226 부터 우측 사이드패널 인라인 편집.
//   - 노드 드래그 → debounce 500ms PUT (position 만)
//   - 엔딩 6 색 / 엣지 4 종 시각 구분
//
// #226 — router.push 제거, SidePanel 로 인라인 편집.
//   - 클릭 → setSelectedSceneId.
//   - 저장 콜백 → scenes state 의 해당 씬 교체 → 노드 data (title 등) 즉시 반영.
//
// #231 — bevy-rogue quest CMS 패턴 회수.
//   - 기본 상태(selectedSceneId=null) → SidePanel 미렌더. 그래프가 full-width.
//   - 노드 클릭 → SidePanel mount + slide-in (CSS transition 300ms).
//   - 닫기 → onClose → setSelectedSceneId(null) → unmount.
//   - "노드를 클릭하면 편집" 안내 메시지 제거 (애초에 패널이 안 보임).

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MarkerType,
  useReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { Scene } from "@/types/web-adventure";
import {
  buildGraphFromScenes,
  autoLayout,
  type GraphEdge,
  type SceneWithPosition,
} from "@/lib/web-adventure/engine/graph";
import SceneNode from "./sceneNode";
import { SidePanel } from "./sidePanel";

// 엣지 4 종 색상.
// plain → 진한 회색 실선.
// probability success → 초록 실선.
// probability failure → 빨강 점선.
// conditional → 파랑 실선 (hidden=true 면 점선).
// edgeStyleForKind 는 ./edgeStyle.ts (page 컴포넌트 export 제약 회피).
import { edgeStyleForKind } from "./edgeStyle";

function toReactFlowEdges(edges: GraphEdge[]): Edge[] {
  return edges.map((e) => {
    const { stroke, strokeDasharray, opacity } = edgeStyleForKind(e.data);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.data?.label,
      labelStyle: { fontSize: 10, fill: stroke, ...(opacity ? { opacity } : {}) },
      style: {
        stroke,
        strokeWidth: 1.5,
        ...(strokeDasharray ? { strokeDasharray } : {}),
        ...(opacity ? { opacity } : {}),
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
      data: e.data as unknown as Record<string, unknown>,
    };
  });
}

const NODE_TYPES: NodeTypes = {
  scene: SceneNode as unknown as NodeTypes[string],
};

// #225 — 드래그 vs 클릭 판정 임계값 (px).
// dragStart vs dragStop 거리가 이 값 미만이면 click 으로 간주.
// 이상이면 PUT 으로 위치 저장.
const DRAG_CLICK_THRESHOLD_PX = 5;

// #235 — ReactFlowProvider 안에서 useReactFlow 가 동작하도록 본문을 분리.
// GraphPage 는 단순히 Provider 로 GraphInner 를 wrap.
export default function GraphPage() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}

function GraphInner() {
  // #226 — router.push 는 더 이상 사용하지 않지만, useRouter 를 호출해
  // next/navigation 컨텍스트와 호환을 유지한다 (테스트 mock 호환).
  useRouter();
  // #235 — 카메라 이동용 setCenter 훅.
  const { setCenter } = useReactFlow();
  const [scenes, setScenes] = useState<SceneWithPosition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // #226 — 사이드패널 편집 대상 씬 id.
  // #231 — null 시 SidePanel 자체 미렌더 (mount/unmount + slide-in/out).
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // #225 — drag 시작 좌표 기억 (id → {x,y}).
  // onNodeDragStart 에서 set, onNodeDragStop 에서 비교 후 clear.
  const dragStartRef = useRef<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/web-adventure/content/v1");
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const json = (await res.json()) as {
          data?: { scenes?: SceneWithPosition[] };
          scenes?: SceneWithPosition[];
        };
        const list = json?.data?.scenes ?? json?.scenes ?? [];
        if (!cancelled) setScenes(list);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "씬을 불러올 수 없습니다.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!scenes) return { rfNodes: [] as Node[], rfEdges: [] as Edge[] };
    const { nodes, edges } = buildGraphFromScenes(scenes);
    const laid = autoLayout(nodes, edges);
    const rfn: Node[] = laid.map((n) => ({
      id: n.id,
      position: n.position,
      type: "scene",
      data: n.data as unknown as Record<string, unknown>,
      draggable: true,
      // #235 — 선택 상태를 rfNodes 에 부착.
      // selectedSceneId===null 시 모든 노드 selected=false → ring highlight off.
      selected: n.id === selectedSceneId,
    }));
    return { rfNodes: rfn, rfEdges: toReactFlowEdges(edges) };
  }, [scenes, selectedSceneId]);

  // #235 — 선택 노드를 캔버스 중앙으로 이동.
  // SidePanel 슬라이드인 (300ms transition) 직후 setCenter 호출.
  // ReactFlow 가 flex-1 컨테이너 안이므로 패널이 차지하는 우측은 자동 제외 →
  // 컨테이너 내 가운데 = 사용자 시각상 캔버스 중앙.
  useEffect(() => {
    if (!selectedSceneId) return;
    const node = rfNodes.find((n) => n.id === selectedSceneId);
    if (!node) return;
    const timer = setTimeout(() => {
      setCenter(
        node.position.x + 90, // 노드 width 180 / 2.
        node.position.y + 30, // 노드 height 60 / 2.
        { zoom: 1.2, duration: 400 },
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [selectedSceneId, rfNodes, setCenter]);

  // #225 — 드래그 시작점 저장.
  // ReactFlow 는 노드 mousedown 시 (이동 없어도) onNodeDragStart 를 발화.
  const handleNodeDragStart = useCallback<
    (e: React.MouseEvent, node: Node) => void
  >((_e, node) => {
    dragStartRef.current[node.id] = { x: node.position.x, y: node.position.y };
  }, []);

  // #225 / #226 — 노드 드래그 종료 시:
  //   - 시작점 대비 거리 < 5px → click 으로 처리 → setSelectedSceneId (사이드패널).
  //   - 거리 ≥ 5px → debounce 500ms PUT (위치 저장).
  // 라우팅 / PUT 충돌을 방지하기 위해 별도 onNodeClick 핸들러를 두지 않는다.
  const handleNodeDragStop = useCallback<
    (e: React.MouseEvent, node: Node) => void
  >(
    (_e, node) => {
      const id = node.id;
      const start = dragStartRef.current[id];
      delete dragStartRef.current[id];

      const dx = start ? Math.abs(node.position.x - start.x) : Infinity;
      const dy = start ? Math.abs(node.position.y - start.y) : Infinity;
      const isClick = dx < DRAG_CLICK_THRESHOLD_PX && dy < DRAG_CLICK_THRESHOLD_PX;

      if (isClick) {
        setSelectedSceneId(id);
        return;
      }

      if (debounceRef.current[id]) clearTimeout(debounceRef.current[id]);
      debounceRef.current[id] = setTimeout(() => {
        void fetch(`/api/web-adventure/scenes/${encodeURIComponent(id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: { x: node.position.x, y: node.position.y } }),
        }).catch(() => {
          /* 일시 오류는 무시 — 다음 드래그가 재시도 */
        });
      }, 500);
    },
    [],
  );

  // #226 — SidePanel 저장 콜백 → scenes state 의 해당 씬 교체.
  // ReactFlow 의 rfNodes 가 useMemo 로 scenes 에 의존하므로 자동 재계산 → 노드 data 갱신.
  const handleSceneSaved = useCallback((updated: Scene) => {
    setScenes((prev) => {
      if (!prev) return prev;
      const idx = prev.findIndex((s) => s.id === updated.id);
      if (idx < 0) return prev;
      const next = prev.slice();
      next[idx] = { ...prev[idx], ...updated } as SceneWithPosition;
      return next;
    });
  }, []);

  return (
    <div className="mx-auto px-4 py-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <Link href="/scenes" className="text-xs text-blue-500 hover:underline">
            ← 씬 목록
          </Link>
          <h1 className="text-2xl font-bold mt-1">씬 흐름 차트</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            노드 클릭 = 우측 패널 편집 (슬라이드인) / 노드 드래그 = 위치 저장 (자동 mongo) / 자동 레이아웃 = dagre TB
          </p>
        </div>
        <Legend />
      </div>

      {error && <p className="text-sm text-red-500 mb-2">{error}</p>}

      {!scenes ? (
        <p className="text-gray-400">불러오는 중...</p>
      ) : (
        <div
          className="flex flex-col sm:flex-row gap-0 sm:gap-2"
          style={{ width: "100%", height: "calc(100vh - 200px)", minHeight: 600 }}
          data-graph-container
        >
          <div className="flex-1 min-w-0 h-full">
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={NODE_TYPES}
              nodesDraggable
              onNodeDragStart={handleNodeDragStart}
              onNodeDragStop={handleNodeDragStop}
              // #233 — ReactFlow 는 순수 클릭(움직임 0) 시 onNodeDragStart/Stop
              // 자체를 발화하지 않는다. handleNodeDragStop 의 isClick 분기는 작은
              // 드래그(< 5px) 에만 도달하므로, 순수 클릭은 onNodeClick 으로 처리.
              onNodeClick={(_, node) => setSelectedSceneId(node.id)}
              fitView
              minZoom={0.2}
              maxZoom={2}
            >
              <Background gap={20} size={1} color="#e5e7eb" />
              <Controls />
            </ReactFlow>
          </div>
          {selectedSceneId && (
            <SidePanel
              sceneId={selectedSceneId}
              onClose={() => setSelectedSceneId(null)}
              onSaved={handleSceneSaved}
            />
          )}
        </div>
      )}
    </div>
  );
}

// #270 〈에테르니아의 추락〉 — 6 엔딩 + 엣지 4 종 범례.
function Legend() {
  return (
    <div className="text-xs space-y-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded p-2 shadow-sm">
      <div className="font-bold mb-1">범례 — 〈에테르니아의 추락〉</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-amber-200 border border-amber-500" /> ✨ 승천</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-200 border border-red-600" /> ⚙️ 혁명</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-emerald-200 border border-emerald-600" /> ☯ 조화</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-gray-300 border border-gray-500" /> 💀 추락</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-indigo-300 border border-indigo-700" /> 🗿 석화</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-lime-200 border border-lime-600" /> 🌿 정령의 결속</span>
      </div>
      <div className="border-t border-gray-200 dark:border-gray-600 pt-1 mt-1 flex flex-wrap gap-x-3 gap-y-1">
        <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-violet-500" /> ⭐ 시작 씬</span>
      </div>
      <div className="border-t border-gray-200 dark:border-gray-600 pt-1 mt-1 flex flex-wrap gap-x-3 gap-y-1">
        <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-gray-700" /> 일반 분기</span>
        <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-green-600" /> 확률 성공</span>
        <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-red-600 border-dashed" /> 확률 실패</span>
        <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-blue-600" /> 조건 분기</span>
        <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-gray-400 border-dashed" /> 조건 (숨김)</span>
      </div>
    </div>
  );
}

export type { Scene };
