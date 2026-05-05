# 퀘스트 에디터 — 선택된 노드 시각적 강조

## 목적

다중 선택 시 어떤 노드가 선택됐는지 외곽선으로 명확히 표시한다.

## 동작

| 상태 | 외곽선 |
|------|--------|
| 미선택 (일반) | 회색 (`border-gray-300`) |
| 미선택 (시작 노드) | 파란색 (`border-blue-500`) |
| 선택됨 | 노란색 외곽선 + ring (`border-yellow-400 ring-2 ring-yellow-300`) |

선택 상태는 ReactFlow `NodeProps.selected` 값으로 판단한다.

## 구현

- `PhaseNode`의 `NodeProps`에서 `selected` prop을 읽는다
- 선택 시 border 색상을 yellow로 교체하고 `ring-2` 추가
