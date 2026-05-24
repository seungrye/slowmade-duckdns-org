# Villager id 마이그레이션 (bevy-rogue 동기화)

bevy-rogue 가 villager 에 unique `id` 를 도입하고 `quest_id` 를 제거했다
(게임 commit fd14e53). 퀘스트의 `giver_npc` / `KillNpc` 가 villager `id` 를
참조한다. 사이트는 아직 villager 를 `name` 으로 식별하고 RON 파서가 `id` 를
모른다 → villagers.ron import 실패 + quest `giver_npc` 검증 불일치.

사이트 villager 정체성을 `name` → `id` 로 전환한다.

## 배경 / 문제

- villagers.ron 새 형식: `VillagerDef(id: "alchemist", name: "연금술사", ...)`
  (`quest_id` 없음)
- 사이트 파서는 `id` 필드에서 파싱 에러 (`Expected ident got str`)
- villager 정체성이 `name` (unique) → 게임은 `id` (unique), `name` 은 표시용
- villager 카탈로그는 현재 비어 있음 → 기존 데이터 마이그레이션 불필요

## 동작 명세

### 데이터 모델

- [ ] `VillagerDef` 에 `id: string` 추가, `questId` 제거 (`src/types/villager.ts`)
- [ ] Villager 모델: `id` (required, unique) 추가, `name` 의 unique 제거,
  `questId` 제거 (`src/models/villager.tsx`)

### RON 파서/직렬화 (`src/lib/ron.ts`)

- [ ] `parseVillagerDef`: `id` 파싱, `quest_id` 는 있으면 소비 후 무시(하위호환)
- [ ] `serializeVillagerDef`: `id` 출력, `quest_id` 제거

### API (`src/app/api/quests/villagers/`)

- [ ] 동적 세그먼트 `[name]` → `[id]` 로 변경 (route/revisions/restore + 페이지)
- [ ] 조회·수정·삭제를 `id` 기준으로 (`findOne({ id })`)
- [ ] POST(create): `id` 필수, 중복 검사 `id` 기준
- [ ] import: `id` 기준 upsert (스냅샷·갱신에서 questId 제거)
- [ ] export: `id` 포함 직렬화

### 카탈로그 / 검증

- [ ] `catalog-sets.ts`: villager Set 을 `id` 로 구성
- [ ] quest 검증의 `giverNpc` / `KillNpc.npcId` 는 villager `id` 와 대조
  (set 소스만 바뀌므로 로직 변경 없음)

### 에디터 UI

- [ ] `npc-combobox.tsx`: 옵션 value = `id`, 표시에 `name` 병기, 매칭은 `id`
- [ ] 퀘스트 에디터의 `giverNpc` / `KillNpc.npcId` 는 villager `id` 저장
- [ ] `villagers/page.tsx`: 생성 폼에 `id` 추가, 목록/편집/삭제/히스토리를
  `id` 기준으로
- [ ] `villagers/[id]/revisions/page.tsx`: `id` 기준

### 테스트

- [ ] 모든 villager 픽스처에 `id` 추가, `questId` 제거
- [ ] villager route/import/export/revisions 테스트 `id` 기준
- [ ] ron villager round-trip, npc-combobox, villagers page 테스트 갱신

## 주의

- villager 컬렉션이 비어 있어 데이터 마이그레이션 없음. (과거 `name_1`
  unique 인덱스가 DB 에 남아도 villagers.ron 의 name 은 모두 유니크라 import
  충돌 없음.)

## 검증 방법

- `pnpm vitest run` 전체 통과
- bevy-rogue villagers.ron 을 사이트 villager import → 14명 등록 성공
- alchemist_quest 재저장 시 `giverNpc: alchemist` 경고가 사라지는지 확인
