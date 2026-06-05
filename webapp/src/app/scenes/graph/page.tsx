// /scenes/graph — ReactFlow + dagre 편집 차트 페이지.
//
// #222 (6 주차):
//   - 30 씬 fetch (/api/web-adventure/content/v1)
//   - dagre TB 자동 레이아웃 (savedPosition 있는 노드는 유지)
//   - 노드 클릭 → /scenes/[id] 이동 (편집 페이지)
//   - 노드 드래그 → debounce 500ms PUT (position 만)
//   - 엔딩 6 색 / 엣지 4 종 시각 구분

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { Scene } from "@/types/web-adventure";
import {
  buildGraphFromScenes,
  autoLayout,
  type GraphEdge,
  type GraphNodeData,
  type SceneWithPosition,
} from "@/lib/web-adventure/engine/graph";
import SceneNode from "./sceneNode";

// 엣지 4 종 색상.
// plain → 진한 회색 실선.
// probability success → 초록 실선.
// probability failure → 빨강 점선.
// conditional → 파랑 실선 (hidden=true 면 점선).
function edgeStyleForKind(data: GraphEdge["data"]): {
  stroke: string;
  strokeDasharray?: string;
} {
  if (!data) return { stroke: "#6b7280" };
  if (data.kind === "plain") return { stroke: "#374151" };
  if (data.kind === "probability") {
    if (data.branch === "success") return { stroke: "#16a34a" };
    return { stroke: "#dc2626", strokeDasharray: "6 4" };
  }
  if (data.kind === "conditional") {
    return data.hidden
      ? { stroke: "#9ca3af", strokeDasharray: "4 3" }
      : { stroke: "#2563eb" };
  }
  return { stroke: "#6b7280" };
}

function toReactFlowEdges(edges: GraphEdge[]): Edge[] {
  return edges.map((e) => {
    const { stroke, strokeDasharray } = edgeStyleForKind(e.data);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.data?.label,
      labelStyle: { fontSize: 10, fill: stroke },
      style: { stroke, strokeWidth: 1.5, ...(strokeDasharray ? { strokeDasharray } : {}) },
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
      data: e.data as unknown as Record<string, unknown>,
    };
  });
}

const NODE_TYPES: NodeTypes = {
  scene: SceneNode as unknown as NodeTypes[string],
};

export default function GraphPage() {
  const router = useRouter();
  const [scenes, setScenes] = useState<SceneWithPosition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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
    }));
    return { rfNodes: rfn, rfEdges: toReactFlowEdges(edges) };
  }, [scenes]);

  // 노드 드래그 끝 → debounce 500ms PUT.
  // jsdom 테스트 환경에서도 호출되도록 try/catch 로 감싼다.
  const handleNodeDragStop = useCallback<
    (e: React.MouseEvent, node: Node) => void
  >((_e, node) => {
    const id = node.id;
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
  }, []);

  // 노드 클릭 → /scenes/[id]. SceneNode 의 data-graph-node-id 가 onClick 으로
  // 직접 받는 게 더 robust 하므로 ReactFlow 의 onNodeClick 과 함께 fallback.
  const handleNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      router.push(`/scenes/${node.id}`);
    },
    [router],
  );

  return (
    <div className="mx-auto px-4 py-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <Link href="/scenes" className="text-xs text-blue-500 hover:underline">
            ← 씬 목록
          </Link>
          <h1 className="text-2xl font-bold mt-1">씬 흐름 차트</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            노드 클릭 = 편집 / 노드 드래그 = 위치 저장 / 자동 레이아웃 = dagre TB
          </p>
        </div>
        <Legend />
      </div>

      {error && <p className="text-sm text-red-500 mb-2">{error}</p>}

      {!scenes ? (
        <p className="text-gray-400">불러오는 중...</p>
      ) : (
        <div
          style={{ width: "100%", height: "calc(100vh - 200px)", minHeight: 600 }}
          data-graph-container
        >
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={NODE_TYPES}
            onNodeClick={handleNodeClick}
            onNodeDragStop={handleNodeDragStop}
            fitView
            minZoom={0.2}
            maxZoom={2}
          >
            <Background gap={20} size={1} color="#e5e7eb" />
            <Controls />
          </ReactFlow>
        </div>
      )}
    </div>
  );
}

// 우측 상단 범례 — 엔딩 6 색 + 엣지 4 종.
function Legend() {
  return (
    <div className="text-xs space-y-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded p-2 shadow-sm">
      <div className="font-bold mb-1">범례</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-amber-200 border border-amber-500" /> 🍪 메인</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-200 border border-green-600" /> 🌲 산신령</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-gray-300 border border-gray-500" /> 💀 실패</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-blue-200 border border-blue-600" /> 🏪 상인</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-purple-200 border border-purple-600" /> 👹 도깨비</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-indigo-300 border border-indigo-700" /> 📚 마법사</span>
      </div>
      <div className="border-t border-gray-200 dark:border-gray-600 pt-1 mt-1 flex flex-wrap gap-x-3 gap-y-1">
        <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-gray-700" /> plain</span>
        <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-green-600" /> 확률 성공</span>
        <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-red-600 border-dashed" /> 확률 실패</span>
        <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-blue-600" /> 조건</span>
        <span className="flex items-center gap-1"><span className="inline-block w-5 border-t-2 border-gray-400 border-dashed" /> 조건 hidden</span>
      </div>
    </div>
  );
}

export type { Scene };
