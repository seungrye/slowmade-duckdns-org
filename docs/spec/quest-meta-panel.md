# ✅ 퀘스트 에디터 — 퀘스트 메타 정보 패널

## 목적

`giverNpc`, `title`, `id` 등 퀘스트 레벨 필드를 에디터에서 표시하고 편집할 수 있게 한다.

## 동작

- 노드/엣지를 선택하지 않은 상태에서 우측 패널에 "퀘스트 정보" 패널을 기본 표시한다.
- 노드 또는 엣지를 선택하면 기존대로 PhasePanel / EdgePanel이 대신 표시된다.

## 편집 가능 필드

| 필드 | 입력 타입 | 비고 |
|------|-----------|------|
| `title` | text input | 퀘스트 제목 |
| `id` | text input | 퀘스트 식별자 (영문·숫자·_) |
| `giverNpc` | text input | 퀘스트 제공 NPC ID |

## 구현 위치

- `webapp/src/app/quests/[id]/quest-info-panel.tsx` — 새 컴포넌트
- `webapp/src/app/quests/[id]/page.tsx` — 우측 패널 조건에 QuestInfoPanel 추가

### page.tsx 변경

```tsx
{selectedNode ? <PhasePanel ... />
  : selectedEdge ? <EdgePanel ... />
  : <QuestInfoPanel quest={quest} onUpdate={...} />}
```

`onUpdate`는 `setQuest` + `setDirty(true)` 호출.

## 검증

- `QuestInfoPanel` 단위 테스트: 각 필드가 렌더되고, 변경 시 onUpdate가 올바른 값으로 호출된다.
