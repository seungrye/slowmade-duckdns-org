# 퀘스트 에디터 — 노드 다중 선택 및 이동

## 목적

여러 노드를 한꺼번에 선택해 이동할 수 있게 한다.

## 동작

| 입력 | 결과 |
|------|------|
| Shift + 클릭 | 개별 노드를 선택 목록에 추가/제거 |
| Shift + 빈 캔버스 드래그 | 박스 셀렉션으로 범위 내 노드 전체 선택 |
| 선택된 노드 드래그 | 선택된 노드 전체 이동 |

## 구현

- `ReactFlow`에 `multiSelectionKeyCode="Shift"` 추가
- `syncPositions` 로직을 순수 함수 `syncPhasePositions`로 추출해 테스트 가능하게 함

## 검증

- `syncPhasePositions`: 여러 노드 위치를 한 번에 quest.phases에 반영한다
