# 퀘스트 에디터 — 박스 셀렉션 제거

## 목적

Shift+드래그 시 나타나는 파란색 반투명 selection rect를 제거한다.
선택은 Shift+클릭으로만 하고, 선택된 노드를 직접 드래그해서 이동한다.

## 변경

- ReactFlow에서 `selectionOnDrag` prop 제거
- ReactFlow에서 `selectionKeyCode` prop 제거
- `multiSelectionKeyCode="Shift"` 는 유지 (Shift+클릭 다중 선택)
