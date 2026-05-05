# 퀘스트 노드 그래프 에디터

## 목적

웹 UI에서 퀘스트 흐름(phase → transition)을 노드-엣지 그래프로 시각적으로 작성·편집하고, MongoDB에 저장·버전 관리하며 `.ron` 포맷으로 import/export한다.

---

## 데이터 모델

### Quest (MongoDB)

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string | 퀘스트 식별자 (e.g. `stark_quest`) |
| `title` | string | 퀘스트 제목 |
| `giverNpc` | string | 의뢰 NPC 이름 |
| `initialPhase` | string | 시작 페이즈 ID |
| `phases` | Record<string, QuestPhaseDef> | 페이즈 맵 |
| `spawns` | QuestSpawn[] | 아이템 스폰 정의 |
| `version` | number | 현재 버전 번호 |
| timestamps | — | createdAt, updatedAt |

### QuestRevision (MongoDB)

| 필드 | 타입 | 설명 |
|------|------|------|
| `questId` | ObjectId(Quest) | 원본 퀘스트 참조 |
| `version` | number | 스냅샷 버전 번호 |
| `quest` | QuestDef | 해당 버전의 전체 퀘스트 데이터 |
| `createdAt` | Date | 저장 시각 |

### QuestPhaseDef (임베디드)

- `dialog`: string[] — NPC 대사 목록
- `on_interact`: Action[] — 플레이어 상호작용 시 실행 액션
- `auto_advance`: AutoAdvance[] — 조건 충족 시 자동 전환
- `objective`: string | null — 현재 목표 텍스트
- `position`: { x, y } — 에디터 캔버스 노드 위치

### Action 변형

- `AdvancePhase(phaseId)` — 페이즈 전환
- `Log(text)` — 내러티브 텍스트 출력
- `GiveItem(itemId)` — 아이템 지급
- `SetFlag(flag, value)` — 플래그 설정
- `KillNpc(npcId)` — NPC 제거
- `Branch([{ condition, phaseId }])` — 조건 분기

### 조건(Condition) 변형

- `FlagIs(flag, value)` — 플래그 값 비교
- `HasItem(itemId)` — 인벤토리 아이템 보유 여부
- `Always` — 무조건

---

## 페이지 구조

| 경로 | 설명 |
|------|------|
| `/quests` | 퀘스트 목록 + 새 퀘스트 생성 + `.ron` import |
| `/quests/[id]` | 노드 그래프 에디터 |
| `/quests/[id]/revisions` | 버전 히스토리 목록 + 롤백 |

---

## API Routes

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/quests` | 목록 조회 |
| POST | `/api/quests` | 새 퀘스트 생성 |
| GET | `/api/quests/[id]` | 단일 퀘스트 조회 |
| PUT | `/api/quests/[id]` | 퀘스트 저장 (revision 자동 생성) |
| GET | `/api/quests/[id]/export` | `.ron` 파일 다운로드 |
| POST | `/api/quests/[id]/import` | `.ron` 파싱 → DB 저장 |
| GET | `/api/quests/[id]/revisions` | 버전 목록 조회 |
| POST | `/api/quests/[id]/revisions/[ver]/restore` | 특정 버전으로 롤백 |

---

## 에디터 UI 구성

### 캔버스 (React Flow / @xyflow/react)

- 노드 = QuestPhaseDef (phase ID가 노드 ID)
- 엣지 = 전환 관계
  - `on_interact` 내 `AdvancePhase` → 파란 실선
  - `auto_advance` 조건부 전환 → 주황 점선
  - `Branch` 분기 → 여러 엣지로 펼쳐짐
- 노드 클릭 → 우측 패널에서 dialog / objective / on_interact 편집
- 엣지 클릭 → 우측 패널에서 조건(Condition) 편집
- 노드 드래그로 위치 조정 → `position` 필드에 저장

### 노드 편집 패널

- phase ID (읽기 전용)
- dialog 목록 (줄별 textarea, 순서 변경 가능)
- objective (단일 textarea, nullable)
- on_interact 액션 목록 (액션 타입 선택 + 파라미터 입력)
- 페이즈 삭제 버튼

### 엣지 편집 패널

- 전환 타입 표시 (`on_interact` / `auto_advance`)
- 조건 편집
  - `FlagIs`: flag 이름, value 입력
  - `HasItem`: itemId 입력
  - `Always`: 조건 없음 표시
- 목적 페이즈 (읽기 전용, 드래그로 변경)

---

## RON 파서/직렬화

- **파서**: 기존 `.ron` 퀘스트 파일 subset 파싱 → `QuestDef` 객체
- **직렬화**: `QuestDef` → `.ron` 문자열 (기존 파일 스타일 재현)
- 커버 범위: QuestDef, QuestPhaseDef, Action 전 변형, AutoAdvance, SpawnZone

---

---

## RON 파서 보완 (버그픽스)

실제 `.ron` 파일 파싱 검증 결과 누락된 구문 발견.

### 누락된 조건 타입

| 구문 | 예시 |
|------|------|
| `And([cond, ...])` | `And([HasItem("x"), FlagIs(flag:"y", value:"z")])` |
| `Or([cond, ...])` | `Or([HasItem("x"), PhaseIs(...)])` |
| `Not(cond)` | `Not(HasItem("dragon_scale"))` |
| `PhaseIs(quest: "...", phase: "...")` | 퀘스트 간 교차 참조 |

### Branch 구조 완전 재설계

기존 구현(잘못됨):
```ron
Branch([{ condition, phaseId }])
```
실제 파일 구조:
```ron
Branch(
    condition: <condition>,
    if_true: [actions...],
    if_false: [actions...],
)
```

### 누락된 액션 타입

- `RemoveItem(itemId)` — 인벤토리에서 아이템 제거
- `DespawnWorldItem(itemId)` — 월드 오브젝트 제거

### AutoAdvance actions 필드

```ron
AutoAdvance(
    condition: HasItem("x"),
    next_phase: "y",
    actions: [DespawnWorldItem("z")],   // 선택 필드
)
```

### 수정 파일

- ✅ `src/types/quest.ts` — Condition / Action / AutoAdvance / SpawnZone 타입 확장
- ✅ `src/lib/ron.ts` — 파서 + 직렬화 전체 보완
- ✅ `src/lib/ron.test.ts` — 24개 테스트, 실제 7개 .ron 파일 전수 통과
- ✅ `src/app/quests/[id]/action-editor.tsx` — Branch if_true/if_false UI 반영
- ✅ 추가 발견: `InZone(zone)` 조건, `Forest` (괄호 없는) SpawnZone

## 작업 목록

- ✅ `src/types/quest.ts` — 타입 정의
- ✅ `src/models/quest.tsx` — Quest 모델
- ✅ `src/models/quest-revision.tsx` — QuestRevision 모델
- ✅ `src/lib/ron.ts` — RON 파서 + 직렬화
- ✅ `src/lib/ron.test.ts` — RON 파서 단위 테스트 (10개)
- ✅ `src/app/api/quests/route.tsx` — GET / POST
- ✅ `src/app/api/quests/[id]/route.tsx` — GET / PUT
- ✅ `src/app/api/quests/[id]/export/route.tsx`
- ✅ `src/app/api/quests/[id]/import/route.tsx`
- ✅ `src/app/api/quests/[id]/revisions/route.tsx`
- ✅ `src/app/api/quests/[id]/revisions/[ver]/restore/route.tsx`
- ✅ `src/app/quests/page.tsx` — 목록 페이지
- ✅ `src/app/quests/[id]/page.tsx` — 노드 에디터
- ✅ `src/app/quests/[id]/revisions/page.tsx` — 버전 히스토리
