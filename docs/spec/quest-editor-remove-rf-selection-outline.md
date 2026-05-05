# 퀘스트 에디터 — ReactFlow 기본 선택 외곽선 제거

## 목적

노드 선택 시 ReactFlow가 자동으로 그리는 파란색 박스(`.react-flow__node.selected` outline)를 제거한다.
선택 표시는 PhaseNode 자체의 노란색 ring으로만 나타낸다.

## 변경

- `globals.css`에 `.react-flow__node.selected { outline: none; }` 추가
