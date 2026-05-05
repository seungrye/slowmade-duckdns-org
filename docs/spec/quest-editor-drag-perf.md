# 퀘스트 에디터 — 노드 드래그 성능 개선

## 문제

드래그 중 ReactFlow가 매 mousemove마다 `onNodesChange`를 호출하고, 이 콜백이
`nodes` state를 갱신하면서 `QuestEditorPage` 전체가 리렌더된다.
그 결과 모든 `PhaseNode`가 매 프레임 리렌더되고, `MiniMap`도 전체를 리드로우한다.

## 수정 항목

### 1. `React.memo(PhaseNode)` — `phase-node.tsx`

`PhaseNode`를 `React.memo`로 감싼다.
드래그 중 위치가 바뀌지 않는 노드는 `data` prop 참조가 동일하므로 리렌더를 건너뛴다.

### 2. `MiniMap` 제거 — `page.tsx`

`<MiniMap />`은 매 위치 변경마다 전체 미니맵을 리드로우한다.
퀘스트 노드 수가 적어 전체 조망 필요성이 낮으므로 제거한다.

### 3. `onNodesChange` `useCallback`으로 감싸기 — `page.tsx`

인라인 화살표 함수로 선언되어 매 렌더마다 새 함수가 생성된다.
`useCallback`으로 감싸 불필요한 함수 재생성을 방지한다.

## 검증

- 기존 동작(노드 클릭 선택, 엣지 색상 하이라이트, 드래그 후 위치 저장)은 그대로 유지된다.
- `PhaseNode` 단위 테스트: memo 적용 후에도 올바르게 렌더되는지 확인한다.
