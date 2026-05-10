"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { QuestDocument, QuestPhaseDef, AutoAdvance } from "@/types/quest";
import type { VillagerDocument } from "@/types/villager";
import type { ItemDocument } from "@/types/item";
import type { ZoneDocument } from "@/types/zone";
import { PhaseNode, type PhaseNodeData } from "./phase-node";
import { PhasePanel } from "./phase-panel";
import { EdgePanel } from "./edge-panel";
import { buildGraph, syncPhasePositions } from "./build-graph";
import { highlightEdges } from "./edge-utils";

const NODE_TYPES: NodeTypes = { phase: PhaseNode };

// ── 메인 에디터 ───────────────────────────────────────────────────────────

export default function QuestEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [quest, setQuest] = useState<QuestDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const [villagers, setVillagers] = useState<VillagerDocument[]>([]);
  const [items, setItems] = useState<ItemDocument[]>([]);
  const [zones, setZones] = useState<ZoneDocument[]>([]);

  // 퀘스트 불러오기
  useEffect(() => {
    fetch(`/api/quests/${id}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setQuest(data);
        const { nodes: n, edges: e } = buildGraph(data);
        setNodes(n);
        setEdges(e);
        setLoading(false);
      });
  }, [id, setNodes, setEdges]);

  // villager 카탈로그 (1회 로드)
  useEffect(() => {
    fetch("/api/quests/villagers")
      .then((r) => r.json())
      .then(({ data }) => setVillagers(data ?? []))
      .catch(() => setVillagers([]));
  }, []);

  // item 카탈로그 (1회 로드)
  useEffect(() => {
    fetch("/api/quests/items")
      .then((r) => r.json())
      .then(({ data }) => setItems(data ?? []))
      .catch(() => setItems([]));
  }, []);

  // zone 카탈로그 (1회 로드)
  useEffect(() => {
    fetch("/api/quests/zones")
      .then((r) => r.json())
      .then(({ data }) => setZones(data ?? []))
      .catch(() => setZones([]));
  }, []);

  // 노드 위치가 변경될 때 quest.phases 위치 동기화
  const syncPositions = useCallback(
    (updatedNodes: Node[]) => {
      if (!quest) return;
      setQuest({ ...quest, phases: syncPhasePositions(quest.phases, updatedNodes) });
      setDirty(true);
    },
    [quest]
  );

  // 엣지 연결: 새 AdvancePhase 또는 auto_advance 추가
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!quest || !connection.source || !connection.target) return;
      const source = connection.source;
      const target = connection.target;
      const phase = quest.phases[source];
      if (!phase) return;

      // 기본: on_interact AdvancePhase로 추가
      const newAction = { type: "AdvancePhase" as const, phaseId: target };
      const updatedPhase: QuestPhaseDef = {
        ...phase,
        on_interact: [...phase.on_interact, newAction],
      };
      const updatedQuest = {
        ...quest,
        phases: { ...quest.phases, [source]: updatedPhase },
      };
      setQuest(updatedQuest);
      setDirty(true);

      const edgeId = `${source}→${target}→interact→${phase.on_interact.length}`;
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: edgeId,
            label: "interact",
            style: { stroke: "#3b82f6" },
            data: { edgeType: "on_interact" },
          },
          eds
        )
      );
    },
    [quest, setEdges]
  );

  // 페이즈 업데이트
  const updatePhase = useCallback(
    (phaseId: string, updated: QuestPhaseDef) => {
      if (!quest) return;
      const updatedQuest = {
        ...quest,
        phases: { ...quest.phases, [phaseId]: updated },
      };
      setQuest(updatedQuest);
      setDirty(true);
      // 해당 노드 data 갱신
      setNodes((nds) =>
        nds.map((n) =>
          n.id === phaseId
            ? { ...n, data: { ...n.data, phase: updated, isInitial: phaseId === updatedQuest.initialPhase, giverNpc: phaseId === updatedQuest.initialPhase ? updatedQuest.giverNpc : undefined } }
            : n
        )
      );
      // 엣지 재구성 (on_interact / auto_advance 변경 반영)
      const { edges: newEdges } = buildGraph(updatedQuest);
      setEdges(newEdges);
    },
    [quest, setNodes, setEdges]
  );

  // 페이즈 삭제
  const deletePhase = useCallback(
    (phaseId: string) => {
      if (!quest) return;
      const restPhases = { ...quest.phases };
      delete restPhases[phaseId];
      const updatedQuest = { ...quest, phases: restPhases };
      setQuest(updatedQuest);
      setDirty(true);
      setNodes((nds) => nds.filter((n) => n.id !== phaseId));
      setEdges((eds) => eds.filter((e) => e.source !== phaseId && e.target !== phaseId));
      if (selectedNodeId === phaseId) setSelectedNodeId(null);
    },
    [quest, setNodes, setEdges, selectedNodeId]
  );

  // 페이즈 추가
  const addPhase = useCallback(() => {
    if (!quest) return;
    const newId = `phase_${Date.now()}`;
    const newPhase: QuestPhaseDef = {
      dialog: [],
      on_interact: [],
      auto_advance: [],
      objective: null,
      position: { x: Object.keys(quest.phases).length * 240, y: 200 },
    };
    const updatedQuest = {
      ...quest,
      phases: { ...quest.phases, [newId]: newPhase },
    };
    setQuest(updatedQuest);
    setDirty(true);
    setNodes((nds) => [
      ...nds,
      {
        id: newId,
        type: "phase",
        position: newPhase.position!,
        data: { phaseId: newId, phase: newPhase, isInitial: false } satisfies PhaseNodeData,
      },
    ]);
    setSelectedNodeId(newId);
  }, [quest, setNodes]);

  // 엣지 삭제 (on_interact AdvancePhase 액션 제거)
  const deleteEdge = useCallback(
    (edgeId: string) => {
      if (!quest) return;
      const edge = edges.find((e) => e.id === edgeId);
      if (!edge) return;

      const phase = quest.phases[edge.source];
      if (!phase) { setEdges((eds) => eds.filter((e) => e.id !== edgeId)); return; }

      const edgeType = (edge.data as { edgeType?: string })?.edgeType;
      let updatedPhase = phase;

      if (edgeType === "on_interact") {
        updatedPhase = {
          ...phase,
          on_interact: phase.on_interact.filter(
            (a) => !(a.type === "AdvancePhase" && a.phaseId === edge.target)
          ),
        };
      } else if (edgeType === "auto_advance") {
        const aaIndex = (edge.data as { aaIndex?: number })?.aaIndex ?? -1;
        updatedPhase = {
          ...phase,
          auto_advance: phase.auto_advance.filter((_, i) => i !== aaIndex),
        };
      }

      const updatedQuest = {
        ...quest,
        phases: { ...quest.phases, [edge.source]: updatedPhase },
      };
      setQuest(updatedQuest);
      setDirty(true);
      const { edges: newEdges } = buildGraph(updatedQuest);
      setEdges(newEdges);
      setSelectedEdgeId(null);
    },
    [quest, edges, setEdges]
  );

  const updateGiverNpc = useCallback(
    (giverNpc: string) => {
      if (!quest) return;
      const updatedQuest = { ...quest, giverNpc };
      setQuest(updatedQuest);
      setDirty(true);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === quest.initialPhase
            ? { ...n, data: { ...n.data, giverNpc } }
            : n
        )
      );
    },
    [quest, setNodes]
  );

  // auto_advance 조건 업데이트
  const updateAutoAdvance = useCallback(
    (sourcePhaseId: string, index: number, updated: AutoAdvance) => {
      if (!quest) return;
      const phase = quest.phases[sourcePhaseId];
      const next = [...phase.auto_advance];
      next[index] = updated;
      updatePhase(sourcePhaseId, { ...phase, auto_advance: next });
    },
    [quest, updatePhase]
  );

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      const hasDragEnd = changes.some(
        (c) => c.type === "position" && !("dragging" in c && c.dragging)
      );
      if (hasDragEnd) setDirty(true);
    },
    [onNodesChange]
  );

  // 저장
  async function save() {
    if (!quest) return;
    // 현재 노드 위치를 phases에 반영
    const phasesWithPos = { ...quest.phases };
    for (const node of nodes) {
      if (phasesWithPos[node.id]) {
        phasesWithPos[node.id] = { ...phasesWithPos[node.id], position: node.position };
      }
    }
    setSaving(true);
    const res = await fetch(`/api/quests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...quest, phases: phasesWithPos }),
    });
    const { data: saved } = await res.json();
    if (saved) setQuest(saved);
    setSaving(false);
    setDirty(false);
  }

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null),
    [selectedNodeId, nodes]
  );
  const selectedEdge = useMemo(
    () => (selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : null),
    [selectedEdgeId, edges]
  );

  const displayEdges = useMemo(
    () => highlightEdges(edges, selectedNodeId),
    [edges, selectedNodeId]
  );

  if (loading) {
    return <div className="flex items-center justify-center h-screen text-gray-400">불러오는 중...</div>;
  }
  if (!quest) {
    return <div className="flex items-center justify-center h-screen text-red-400">퀘스트를 찾을 수 없습니다.</div>;
  }

  const phaseIds = Object.keys(quest.phases);

  return (
    <div className="flex flex-col h-screen">
      {/* 상단 툴바 */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-white dark:bg-gray-950 z-10">
        <div className="flex items-center gap-3">
          <Link href="/quests" className="text-sm text-gray-400 hover:text-gray-600">
            ← 목록
          </Link>
          <div>
            <span className="font-bold">{quest.title}</span>
            <span className="ml-2 text-xs text-gray-400 font-mono">{quest.id}</span>
            <span className="ml-1 text-xs text-gray-400">v{quest.version}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/quests/${id}/revisions`}
            className="px-3 py-1 text-xs rounded border hover:border-gray-400"
          >
            버전 히스토리
          </Link>
          <a
            href={`/api/quests/${id}/export`}
            className="px-3 py-1 text-xs rounded border hover:border-green-400 hover:text-green-600"
          >
            .ron 내보내기
          </a>
          <button
            onClick={addPhase}
            className="px-3 py-1 text-xs rounded border hover:border-blue-400 hover:text-blue-500"
          >
            + 페이즈 추가
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={[
              "px-3 py-1 text-xs rounded",
              dirty
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-gray-100 text-gray-400 dark:bg-gray-800",
            ].join(" ")}
          >
            {saving ? "저장 중..." : dirty ? "저장" : "저장됨"}
          </button>
        </div>
      </div>

      {/* 메인 영역: 캔버스 + 우측 패널 */}
      <div className="flex flex-1 overflow-hidden">
        {/* React Flow 캔버스 */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={displayEdges}
            nodeTypes={NODE_TYPES}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
            }}
            onEdgeClick={(_, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            onNodeDragStop={(_, __, updatedNodes) => syncPositions(updatedNodes)}
            multiSelectionKeyCode="Shift"
            snapToGrid
            snapGrid={[20, 20]}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        {/* 우측 편집 패널 */}
        {(selectedNode || selectedEdge) && (
          <div className="w-80 border-l bg-white dark:bg-gray-950 overflow-hidden flex flex-col">
            {selectedNode && quest.phases[selectedNode.id] && (
              <PhasePanel
                phaseId={selectedNode.id}
                phase={quest.phases[selectedNode.id]}
                isInitial={selectedNode.id === quest.initialPhase}
                giverNpc={quest.giverNpc}
                phaseIds={phaseIds}
                villagers={villagers}
                items={items}
                zones={zones}
                onUpdate={(updated) => updatePhase(selectedNode.id, updated)}
                onUpdateGiverNpc={updateGiverNpc}
                onDelete={() => deletePhase(selectedNode.id)}
                onSetInitial={() => {
                  const updated = { ...quest, initialPhase: selectedNode.id };
                  setQuest(updated);
                  setDirty(true);
                  setNodes((nds) =>
                    nds.map((n) => ({
                      ...n,
                      data: {
                        ...n.data,
                        isInitial: n.id === selectedNode.id,
                        giverNpc: n.id === selectedNode.id ? quest.giverNpc : undefined,
                      },
                    }))
                  );
                }}
              />
            )}
            {selectedEdge && (
              <EdgePanel
                edge={selectedEdge}
                phases={quest.phases}
                items={items}
                zones={zones}
                onUpdateAutoAdvance={updateAutoAdvance}
                onDeleteEdge={deleteEdge}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
