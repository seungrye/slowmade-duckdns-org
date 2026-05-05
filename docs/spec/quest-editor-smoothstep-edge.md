# ✅ 퀘스트 에디터 — 엣지 타입 smoothstep 변경

## 목적

기본 베지어 곡선 대신 ReactFlow 내장 `smoothstep` 타입을 사용해
엣지가 노드를 직각으로 우회하도록 한다.

## 변경

`buildGraph`의 모든 `edges.push(...)` 에 `type: "smoothstep"` 추가.
`onConnect`로 생성되는 엣지에도 동일하게 적용.

## 검증

- `buildGraph` 반환 엣지의 `type`이 모두 `"smoothstep"`인지 확인.
