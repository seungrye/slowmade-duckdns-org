// /scenes/graph — ReactFlow + dagre 편집 차트 페이지.
//
// #222 (6 주차):
//   - 30 씬 fetch (/api/web-adventure/content/v1)
//   - dagre LR 자동 레이아웃 (savedPosition 있는 노드는 유지)
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

import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MarkerType,
  useReactFlow,
  useNodesState,
  useEdgesState,
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
  // #341 — /scenes/[id] 의 '차트에서 보기' 버튼이 ?focus=<id> 로 진입.
  // mount + scenes 로드 후 그 노드 selectedSceneId 설정 + setCenter(zoom: 1.2).
  const searchParams = useSearchParams();
  const focusParam = searchParams?.get("focus") ?? null;
  // #235 — 카메라 이동용 setCenter 훅.
  // #330 — getZoom 추가: 선택 시 *현재 zoom 유지* (확대 금지).
  // #341/fix — getNodes: focus URL 진입의 setTimeout 안에서 *최신* 노드 좌표
  // 가 필요. closure 의 rfNodes 는 stale (마운트 시점 빈 배열).
  const { setCenter, getZoom, getNodes, setNodes, setEdges } = useReactFlow();
  const [scenes, setScenes] = useState<SceneWithPosition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // #226 — 사이드패널 편집 대상 씬 id.
  // #231 — null 시 SidePanel 자체 미렌더 (mount/unmount + slide-in/out).
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  // #341 — focus URL 진입으로 인한 selectedSceneId 인지. 그때만 zoom 1.2 강제.
  const initialFocusAppliedRef = useRef(false);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // #225 — drag 시작 좌표 기억 (id → {x,y}).
  // onNodeDragStart 에서 set, onNodeDragStop 에서 비교 후 clear.
  const dragStartRef = useRef<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // #331 — cache: "no-store" — 드래그한 좌표를 새로고침 시 즉시 받기
        // 위함. content/v1 의 max-age=60 캐시가 PUT 직후 새로고침을 stale
        // 데이터로 채우는 문제 차단. graph 페이지는 admin 도구라 매번 fresh
        // fetch 비용 허용.
        const res = await fetch("/api/web-adventure/content/v1", { cache: "no-store" });
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

  // #347 — uncontrolled 패턴: ReactFlow 의 *내부 store* 만 사용.
  //   외부 useNodesState 시 매 mousemove 마다 외부 state 갱신 → 컴포넌트 re-render
  //   → 노드 드래그 응답성 큰 부담. setNodes/setEdges 가 internal store 만 갱신.
  //   ReactFlow 의 `nodes`/`edges` prop 안 줌 → uncontrolled 모드 활성.

  // scenes 가 fetch 되면 노드/엣지 state 를 초기 배치 (dagre autoLayout + savedPosition).
  // 사용자가 드래그로 옮긴 위치는 state 에 남고 mongo 에 PUT 저장됨.
  // 다음 fetch 시 scene.position 으로 다시 들어와 savedPosition 으로 인식.
  useEffect(() => {
    if (!scenes) return;
    const { nodes, edges } = buildGraphFromScenes(scenes);
    const laid = autoLayout(nodes, edges);
    const rfn: Node[] = laid.map((n) => ({
      id: n.id,
      position: n.position,
      type: "scene",
      data: n.data as unknown as Record<string, unknown>,
      draggable: true,
      // #235 — 선택 상태 부착. selectedSceneId 변경 시 별도 effect 로 갱신.
      selected: n.id === selectedSceneId,
    }));
    setNodes(rfn);
    setEdges(toReactFlowEdges(edges));
    // selectedSceneId 가 의도 deps 가 아닌 이유: 셀렉트 변경 시 *씬 데이터 재배치*
    // 하지 않고 *selected 필드만* 갱신 (다음 effect). 여기 deps 에 포함하면 매번
    // 드래그 위치 초기화.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes]);

  // #341 — focus URL param 처리: scenes 가 로드된 후 그 노드를 *선택* + 카메라
  // 중앙 + zoom 1.2 로 확대. 한 번만 (initialFocusAppliedRef 가드).
  // selectedSceneId 변경 시 다른 노드 클릭은 #330 정책 (현재 zoom 유지) 그대로.
  useEffect(() => {
    if (!scenes || !focusParam || initialFocusAppliedRef.current) return;
    const target = scenes.find((s) => s.id === focusParam);
    if (!target) return;
    initialFocusAppliedRef.current = true;
    setSelectedSceneId(focusParam);
    // 노드 좌표 — scene.position (savedPosition) 또는 autoLayout 후 rfNodes 에서 찾기.
    const timer = setTimeout(() => {
      const node = getNodes().find((n) => n.id === focusParam);
      if (!node) return;
      setCenter(node.position.x + 90, node.position.y + 30, {
        zoom: 1.2,
        duration: 600,
      });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes, focusParam]);

  // #235/#329/#346 — selectedSceneId 변경 시 noded.selected 필드 동기화.
  //   - selectedCount > 1 (shift+multi-select) 시 보존 — 깨뜨리지 않음.
  //   - no-op 시 *동일 reference* 반환 — 무한 루프 차단.
  useEffect(() => {
    setNodes((nodes) => {
      const selectedCount = nodes.filter((n) => n.selected).length;
      if (selectedCount > 1) return nodes;
      const needsUpdate = nodes.some(
        (n) => n.selected !== (n.id === selectedSceneId),
      );
      if (!needsUpdate) return nodes;
      return nodes.map((n) =>
        n.selected === (n.id === selectedSceneId)
          ? n
          : { ...n, selected: n.id === selectedSceneId },
      );
    });
  }, [selectedSceneId]);

  // #334/#347 — 선택 노드의 connected edges 에 노란 drop-shadow glow.
  // 변경 없는 edge 는 *동일 reference* 반환 — 114 edge 모두 spread 부담 차단.
  useEffect(() => {
    setEdges((edges) => {
      let changed = false;
      const next = edges.map((e) => {
        const isConnected =
          selectedSceneId !== null &&
          (e.source === selectedSceneId || e.target === selectedSceneId);
        const currentStyle = (e.style ?? {}) as CSSProperties;
        const hasFilter = typeof currentStyle.filter === "string" && currentStyle.filter.includes("drop-shadow");
        // 동일 상태면 그대로.
        if (isConnected === hasFilter) return e;
        changed = true;
        const { filter: _drop, ...rest } = currentStyle;
        void _drop;
        const nextStyle: CSSProperties = isConnected
          ? {
              ...rest,
              filter:
                "drop-shadow(0 0 4px #fde047) drop-shadow(0 0 6px #fde047)",
            }
          : rest;
        return { ...e, style: nextStyle };
      });
      return changed ? next : edges;
    });
  }, [selectedSceneId]);

  // #235 (제거) — 노드 클릭 시 setCenter 카메라 이동 제거.
  //   #347: 69 노드 + 114 edge 환경에서 *클릭 응답성 저하 주요 원인*.
  //   focus URL 진입 시 (#341) 만 직접 setCenter — 그것은 *명시 의도* 라 유지.

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
    (e: React.MouseEvent, node: Node, nodes: Node[]) => void
  >(
    (_e, node, nodes) => {
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

      // #346 — 다수 함께 드래그 시 각 노드 별 PUT. nodes 비어있으면 단일 node.
      const dragged = nodes && nodes.length > 0 ? nodes : [node];
      for (const n of dragged) {
        const nid = n.id;
        if (debounceRef.current[nid]) clearTimeout(debounceRef.current[nid]);
        debounceRef.current[nid] = setTimeout(() => {
          void fetch(`/api/web-adventure/scenes/${encodeURIComponent(nid)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ position: { x: n.position.x, y: n.position.y } }),
          }).catch(() => {
            /* 일시 오류는 무시 — 다음 드래그가 재시도 */
          });
        }, 500);
      }
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
            노드 클릭 = 우측 패널 편집 (슬라이드인) / 노드 드래그 = 위치 저장 (자동 mongo) / 자동 레이아웃 = dagre LR
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
              // #347 — uncontrolled: defaultNodes/defaultEdges 빈 배열 명시.
              //   useReactFlow().setNodes/setEdges 로 비동기 fetch 후 갱신.
              //   드래그 시 외부 state 갱신 X → 컴포넌트 재 렌더 없음.
              defaultNodes={[]}
              defaultEdges={[]}
              nodeTypes={NODE_TYPES}
              nodesDraggable
              onNodeDragStart={handleNodeDragStart}
              onNodeDragStop={handleNodeDragStop}
              // #233 — ReactFlow 는 순수 클릭(움직임 0) 시 onNodeDragStart/Stop
              // 자체를 발화하지 않는다. handleNodeDragStop 의 isClick 분기는 작은
              // 드래그(< 5px) 에만 도달하므로, 순수 클릭은 onNodeClick 으로 처리.
              // #346 — multi-select: shift+클릭/drag select. shift 키 안 누른
              //   클릭만 단일 선택 강제. shift+click 은 ReactFlow 가 알아서 추가
              //   선택 (multiSelectionKeyCode 기본값="Shift").
              multiSelectionKeyCode="Shift"
              onNodeClick={(e, node) => {
                if ((e as React.MouseEvent).shiftKey) return;
                setSelectedSceneId(node.id);
              }}
              // 2+ 다수 선택 시 SidePanel unmount.
              onSelectionChange={({ nodes: selNodes }) => {
                if (selNodes.length > 1) setSelectedSceneId(null);
              }}
              // #336 — 캔버스 빈 여백 클릭 → 패널 닫기 + selected 해제 + 엣지
              // glow 제거. setSelectedSceneId(null) 한 번이면 useEffect 들이
              // 모두 동기화 — SidePanel unmount + 노드 selected=false + 엣지
              // filter 제거.
              onPaneClick={() => setSelectedSceneId(null)}
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

// #270 〈에테르니아의 추락〉 — 노드/엣지 범례.
// #335 — 6 엔딩 개별 색 라인 제거. 엔딩 노드는 단일 색 (amber) 으로 통일.
function Legend() {
  return (
    <div className="text-xs space-y-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded p-2 shadow-sm">
      <div className="font-bold mb-1">범례 — 〈에테르니아의 추락〉</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-amber-200 border border-amber-500" /> 🏁 엔딩 씬</span>
        <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-violet-500" /> ⭐ 시작 씬</span>
        {/* #334 — 선택 노드의 연결 엣지 노란 glow. */}
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-5 border-t-2 border-gray-700"
            style={{ filter: "drop-shadow(0 0 4px #fde047) drop-shadow(0 0 6px #fde047)" }}
          />{" "}
          선택 노드 연결선
        </span>
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
