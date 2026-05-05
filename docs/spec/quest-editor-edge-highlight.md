# ✅ 퀘스트 에디터 — 선택 노드 기준 엣지 하이라이트

## 목적

카드(노드)를 선택했을 때 연결 라인(엣지) 색상을 방향 기준으로 바꿔 흐름을 직관적으로 파악할 수 있게 한다.

## 동작 규칙

| 조건 | 색상 |
|------|------|
| 선택 노드로 들어오는 엣지 (`target === selectedNodeId`) | 파란색 `#3b82f6` |
| 선택 노드에서 나가는 엣지 (`source === selectedNodeId`) | 빨간색 `#ef4444` |
| 선택 노드와 무관한 엣지 | 앰버 `#f59e0b` |
| 노드 미선택 시 | 기존 타입별 색상 유지 |

## 구현 위치

`webapp/src/app/quests/[id]/page.tsx`

- `displayEdges` useMemo 추가: `selectedNodeId` 기준으로 edges 색상을 재매핑
- ReactFlow `edges` prop을 `displayEdges`로 교체
- 원본 `edges` state는 그대로 유지 (로직/저장에 계속 사용)

## 비고

- 엣지 선 스타일(실선/대시/애니메이션)은 변경하지 않아 타입 구분 유지
- `selectedEdgeId` 선택 시에는 하이라이트 적용하지 않음 (노드 선택 시에만)
