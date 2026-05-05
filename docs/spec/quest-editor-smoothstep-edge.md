# ✅ 퀘스트 에디터 — smoothstep 엣지

## 목적

기본 베지어 곡선 대신 ReactFlow 내장 `smoothstep` 타입을 사용해
엣지가 노드를 직각으로 우회하도록 한다.

## 변경

`buildGraph`의 모든 `edges.push(...)` 에 `type: "smoothstep"` 추가.
`onConnect`로 생성되는 엣지에도 동일하게 적용.

---

## smoothstep 비활성화 결정

적용 후 사용성 검토 결과 비활성화하기로 결정.
`build-graph.ts` 및 `page.tsx(onConnect)` 에서 `type: "smoothstep"` 제거.
ReactFlow 기본 엣지(bezier)로 복원.
