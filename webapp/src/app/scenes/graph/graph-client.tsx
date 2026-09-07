// /scenes/graph - the ReactFlow + dagre editing chart page.
//
// #222 (week 6):
//   - fetching the 30 scenes (/api/web-adventure/content/v1)
//   - dagre LR automatic layout (a node with a savedPosition keeps it)
//   - a node click -> going to /scenes/[id] (the edit page) - from #226 on, inline editing in the right-hand side panel.
//   - a node drag -> a 500ms debounced PUT (the position alone)
//   - 6 ending colours and 4 edge kinds, told apart visually
//
// #226 - router.push removed, editing inline through the SidePanel.
//   - a click -> setSelectedSceneId.
//   - the save callback -> that scene is replaced in the scenes state -> the node data (title and so on) updates at once.
//
// #231 - reclaiming the bevy-rogue quest CMS pattern.
//   - the default state (selectedSceneId=null) -> the SidePanel is not rendered. The graph is full-width.
//   - a node click -> the SidePanel mounts and slides in (a 300ms CSS transition).
//   - closing -> onClose -> setSelectedSceneId(null) -> unmount.
//   - the "click a node to edit" hint is gone (the panel is not visible in the first place).

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

// The 4 edge kinds' colours.
// plain -> a dark grey solid line.
// probability success -> a green solid line.
// probability failure -> a red dashed line.
// conditional -> a blue solid line (dashed when hidden=true).
// edgeStyleForKind lives in ./edgeStyle.ts (working around the page component's export constraint).
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

// #225 - the threshold that tells a drag from a click (px).
// A dragStart-to-dragStop distance below this counts as a click.
// At or above it, the position is saved with a PUT.
const DRAG_CLICK_THRESHOLD_PX = 5;

// #235 - the body is split out so useReactFlow works inside ReactFlowProvider.
// GraphPage simply wraps GraphInner in the Provider.
export default function GraphPage() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}

function GraphInner() {
  // #226 - router.push is no longer used, but useRouter is called to stay
  // compatible with the next/navigation context (and with the test mocks).
  useRouter();
  // #341 - the 'view in the chart' button on /scenes/[id] arrives with ?focus=<id>.
  // After mounting and loading the scenes it sets that node as selectedSceneId and calls setCenter(zoom: 1.2).
  const searchParams = useSearchParams();
  const focusParam = searchParams?.get("focus") ?? null;
  // #235 - the setCenter hook for moving the camera.
  // #341/fix - getNodes: the *latest* node coordinates are needed inside the focus-URL entry's
  // setTimeout. The closure's rfNodes is stale (an empty array at mount time).
  //
  // #330 brought in getZoom to "keep the current zoom on selection (never zoom in)", but #341 changed
  // focus entry to a fixed zoom of 1.2 and left it unused (see setCenter below).
  // There is no zoom-keeping behaviour now - reviving it means changing setCenter's zoom back to getZoom().
  const { setCenter, getNodes, setNodes, setEdges } = useReactFlow();
  const [scenes, setScenes] = useState<SceneWithPosition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // #226 - the id of the scene the side panel is editing.
  // #231 - when null the SidePanel itself is not rendered (mount/unmount plus slide in/out).
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  // #341 - whether selectedSceneId came from a focus-URL entry. The zoom is forced to 1.2 only then.
  const initialFocusAppliedRef = useRef(false);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // #225 - remembering the drag's starting coordinates (id -> {x,y}).
  // Set in onNodeDragStart, compared and cleared in onNodeDragStop.
  const dragStartRef = useRef<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // #331 - cache: "no-store" - so a dragged coordinate comes back at once on a
        // refresh. It blocks content/v1's max-age=60 cache filling a refresh right after a PUT
        // with stale data. Being an admin tool, the graph page can afford a fresh
        // fetch every time.
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

  // #347 - the uncontrolled pattern: ReactFlow's *internal store* alone is used.
  //   An external useNodesState updates external state on every mousemove -> the component re-renders
  //   -> a heavy cost to node-drag responsiveness. setNodes/setEdges update the internal store only.
  //   ReactFlow gets no `nodes`/`edges` prop -> uncontrolled mode is active.

  // Once the scenes are fetched, the node and edge state is laid out initially (elk autoLayout plus savedPosition).
  // #347 - autoLayout became async (elkjs) -> awaited inside the useEffect.
  useEffect(() => {
    if (!scenes) return;
    let cancelled = false;
    (async () => {
      const { nodes, edges } = buildGraphFromScenes(scenes);
      const laid = await autoLayout(nodes, edges);
      if (cancelled) return;
      const rfn: Node[] = laid.map((n) => ({
        id: n.id,
        position: n.position,
        type: "scene",
        data: n.data as unknown as Record<string, unknown>,
        draggable: true,
        // focusParam comes along too - by the time the async autoLayout finishes, the selectedSceneId
        // closure can be stale (the focus-URL effect having called setSelectedSceneId meanwhile).
        selected: n.id === selectedSceneId || n.id === focusParam,
      }));
      setNodes(rfn);
      setEdges(toReactFlowEdges(edges));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes]);

  // #341 - handling the focus URL param: once the scenes load, that node is *selected*, the camera
  // is centred and zoomed to 1.2. Once only (guarded by initialFocusAppliedRef).
  // When selectedSceneId changes, clicking another node keeps #330's policy (the current zoom) as it was.
  useEffect(() => {
    if (!scenes || !focusParam || initialFocusAppliedRef.current) return;
    const target = scenes.find((s) => s.id === focusParam);
    if (!target) return;
    initialFocusAppliedRef.current = true;
    setSelectedSceneId(focusParam);
    // The node's coordinates - scene.position (savedPosition), or found in rfNodes after autoLayout.
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

  // #235/#329/#346 - a changed selectedSceneId syncs the nodes' selected field.
  //   - preserved when selectedCount > 1 (shift multi-select) - it is not broken.
  //   - a no-op returns the *same reference* - blocking an infinite loop.
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
    // #85 — setNodes 는 useReactFlow() 가 돌려주는 안정적 참조라(리렌더해도 같은 함수)
    // 의존성에 넣어도 effect 가 다시 돌지 않는다. 테스트로 확인했다.
  }, [selectedSceneId, setNodes]);

  // #334/#347 - a yellow drop-shadow glow on the selected node's connected edges.
  // An unchanged edge returns the *same reference* - avoiding the cost of spreading all 114 edges.
  useEffect(() => {
    setEdges((edges) => {
      let changed = false;
      const next = edges.map((e) => {
        const isConnected =
          selectedSceneId !== null &&
          (e.source === selectedSceneId || e.target === selectedSceneId);
        const currentStyle = (e.style ?? {}) as CSSProperties;
        const hasFilter = typeof currentStyle.filter === "string" && currentStyle.filter.includes("drop-shadow");
        // The same state is left as it is.
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
    // #85 — setEdges 도 setNodes 와 같이 안정적 참조다.
  }, [selectedSceneId, setEdges]);

  // #235 (removed) - the setCenter camera move on a node click is gone.
  //   #347: with 69 nodes and 114 edges it was *the main cause of poor click responsiveness*.
  //   setCenter is called directly only on a focus-URL entry (#341) - that being *explicit intent*, it stays.

  // #225 - storing the drag's starting point.
  // ReactFlow fires onNodeDragStart on a node mousedown (even with no movement).
  const handleNodeDragStart = useCallback<
    (e: React.MouseEvent, node: Node) => void
  >((_e, node) => {
    dragStartRef.current[node.id] = { x: node.position.x, y: node.position.y };
  }, []);

  // #225 / #226 - when a node drag ends:
  //   - a distance from the start below 5px -> treated as a click -> setSelectedSceneId (the side panel).
  //   - at or above 5px -> a 500ms debounced PUT (saving the position).
  // No separate onNodeClick handler is kept, to avoid a routing/PUT clash.
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

      // #346 - dragging several together PUTs per node. With nodes empty it is the single node.
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

  // #226 - the SidePanel's save callback -> that scene is replaced in the scenes state.
  // ReactFlow's rfNodes depends on scenes through useMemo, so it recomputes automatically -> the node data updates.
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
              // #347 - uncontrolled: defaultNodes/defaultEdges are given as explicit empty arrays.
              //   They are updated after the async fetch through useReactFlow().setNodes/setEdges.
              //   A drag updates no external state -> the component does not re-render.
              defaultNodes={[]}
              defaultEdges={[]}
              nodeTypes={NODE_TYPES}
              nodesDraggable
              onNodeDragStart={handleNodeDragStart}
              onNodeDragStop={handleNodeDragStop}
              // #233 - on a pure click (zero movement) ReactFlow does not fire onNodeDragStart/Stop
              // at all. handleNodeDragStop's isClick branch is reached only by a small
              // drag (< 5px), so a pure click is handled by onNodeClick.
              // #346 - multi-select: shift-click or drag select. Only a click without
              //   the shift key forces a single selection. ReactFlow handles shift-click's
              //   additive selection itself (multiSelectionKeyCode defaults to "Shift").
              multiSelectionKeyCode="Shift"
              onNodeClick={(e, node) => {
                if ((e as React.MouseEvent).shiftKey) return;
                setSelectedSceneId(node.id);
              }}
              // With 2 or more selected the SidePanel unmounts.
              onSelectionChange={({ nodes: selNodes }) => {
                if (selNodes.length > 1) setSelectedSceneId(null);
              }}
              // #336 - clicking the canvas's empty space closes the panel, clears the selection and removes the edge
              // glow. A single setSelectedSceneId(null) syncs every useEffect -
              // the SidePanel unmounts, the nodes go selected=false and the edge
              // filter is removed.
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

// #270 The Fall of Eternia - the node and edge legend.
// #335 - the 6 endings' individual colour lines are gone. Ending nodes are unified in a single colour (amber).
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
