# 퀘스트 카탈로그 시스템

bevy-rogue 의 villager / quest_item / Named zone 을 webapp 에서 1급
카탈로그로 관리한다. 퀘스트 RON 의 stringly-typed 참조 (`giverNpc`,
`itemId`, `OpenPortal.zone`) 를 카탈로그 ID 기반으로 자동완성·검증한다.

## 배경

`giverNpc` / `GiveItem.itemId` / `OpenPortal.zone` 등은 free-form
문자열이라 오타 검증이 안 된다. Rust 런타임은 startup 에서
`validate_quest_villager_refs` / `validate_quest_item_refs` 로 끊어진
참조를 발견하면 process exit 하지만, webapp 에선 잘못된 RON 을 export
할 수 있다.

bevy-rogue 의 데이터 분리 구조와 일치시킨다:
- `assets/villagers/villagers.ron` — `Vec<VillagerDef>`
- `assets/items/{quest_items,weapons,armors,consumables}.ron`
- Named zones — 각 quest 의 `OpenPortal` 액션에 분산 등록 (별도 RON 없음)

## 사이클 분할

| 단계 | 범위 |
|------|------|
| C1 | Villagers 카탈로그 (a: 스키마+API, b: UI+시드, c: picker 통합) |
| C2 | Items 카탈로그 (4종 통합: quest/weapon/armor/consumable) |
| C3 | Named zones 카탈로그 |
| C4 | 저장 시 참조 무결성 검증 |

---

## ✅ C1a — Villagers 스키마 + CRUD API

### MongoDB 컬렉션

`villagers` 컬렉션. 스키마는 Rust `VillagerDef` 와 일치:

| 필드 | 타입 | 제약 / 기본 |
|------|------|------|
| `name` | `String` | required, **unique** (PK 역할) |
| `color` | `[Number, Number, Number]` | required, RGB 0.0~1.0 |
| `dialogs` | `[String]` | default `[]` |
| `questId` | `String \| null` | default `null` |
| `speed` | `Number` | default `1.0` |

`name` 을 PK 로 쓰는 이유: bevy-rogue 의 `giver_npc` 가 이름 기준으로
참조하므로 이름 변경은 모든 quest RON 영향. unique 제약으로 일관성 유지.

### API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/villagers` | 목록 |
| POST | `/api/villagers` | 생성 — name 중복 시 409 |
| GET | `/api/villagers/[name]` | 단일 조회 |
| PUT | `/api/villagers/[name]` | 수정 (name 자체는 변경 불가) |
| DELETE | `/api/villagers/[name]` | 삭제 |

응답 포맷은 기존 `apiSuccess`/`apiError` 컨벤션 준수.

### 검증

- `POST` 시 `name` (string), `color` ([3 numbers, 0~1]) 필수
- `dialogs` 미제공 시 `[]`, `questId` 미제공 시 `null`, `speed` 미제공 시 `1.0`
- `PUT` 시 body 의 `name` 필드는 무시 (URL 의 name 이 PK)

### 변경 범위

- [x] `webapp/src/models/villager.tsx` — Mongoose 스키마
- [x] `webapp/src/app/api/villagers/route.tsx` — GET, POST
- [x] `webapp/src/app/api/villagers/[name]/route.tsx` — GET, PUT, DELETE
- [x] 위 API 의 단위 테스트 (`*.test.ts`)
- [x] `webapp/src/types/villager.ts` — TypeScript 타입

### 비목표 (다음 사이클)

- 페이지 UI / 시드 import — C1b
- 퀘스트 에디터 picker 통합 — C1c
- 다른 카탈로그 — C2/C3
- 참조 무결성 검증 — C4
