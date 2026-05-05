# 퀘스트 에디터 — 시작 노드에 giverNpc 표시 및 편집

## 목적

`giverNpc`를 별도 패널 없이 시작 페이즈 노드에 통합한다.

## 변경 내용

### 1. QuestInfoPanel 롤백

- `quest-info-panel.tsx` 삭제
- `page.tsx` 우측 패널을 "노드/엣지 선택 시에만 표시"로 복원

### 2. PhaseNode — giverNpc 뱃지 표시 (`phase-node.tsx`)

- `PhaseNodeData`에 `giverNpc?: string` 추가
- `isInitial=true`일 때 헤더 아래에 `NPC: <giverNpc>` 뱃지 표시

### 3. PhasePanel — giverNpc 편집 필드 (`phase-panel.tsx`)

- `giverNpc: string`, `onUpdateGiverNpc: (v: string) => void` prop 추가
- `isInitial=true`일 때만 "Giver NPC" 입력 필드 렌더

### 4. page.tsx — 데이터 연결

- `buildGraph`에서 초기 페이즈 노드에 `giverNpc` 전달
- `updatePhase` 호출 시 노드 data 갱신에 `giverNpc` 유지
- `onUpdateGiverNpc` 콜백: `setQuest({ ...quest, giverNpc })` + `setDirty(true)` + 해당 노드 data 갱신

## 검증

- `PhaseNode`: `isInitial=true`이고 `giverNpc`가 있을 때 뱃지가 렌더된다
- `PhaseNode`: `isInitial=false`이면 뱃지가 없다
- `PhasePanel`: `isInitial=true`이면 giverNpc 입력 필드가 렌더된다
- `PhasePanel`: `isInitial=false`이면 giverNpc 입력 필드가 없다
- `PhasePanel`: 입력 변경 시 `onUpdateGiverNpc`가 호출된다
