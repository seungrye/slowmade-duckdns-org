# scripts/ — Web Adventure 운영 도구

## 콘텐츠 시드 (`seed-*.mjs`) — 순서 의존

mongo 의 `webadventurescenes` 컬렉션을 적치/patch 한다. **act1 시드는 본문 + 분기를 *완전 정의* (덮어쓰기)** 라 후속 patch 가 덮인다 — 잘못된 순서로 재실행 시 데이터 손실.

### 재해 복구 — 정확한 순서로 재실행

```bash
MONGO_URI=mongodb://127.0.0.1:27017/handmade-site ./scripts/seeds-replay.sh
```

`seeds-replay.sh` 가 다음 순서로 모든 시드 실행:

1. **초기 적치** (씬 자체 upsert by id)
   - `seed-kael-act1.mjs` / `seed-rin-act1.mjs` / `seed-solwen-act1.mjs` / `seed-act23-omphalos.mjs`

2. **patch** (body + 분기 + onEnter 갱신, 시스템 → 콘텐츠 → 부메랑 → 균형)
   - `seed-station-restructure` (#262 분기 3 제한)
   - `seed-stigma-items` (#261 정제수/파편 획득 위치)
   - `seed-magic-failure-stigma` (#263 마법 실패 +침식)
   - `seed-env-stigma` (#264 환경 침식)
   - `seed-harmony-expand` (#265 sawOtherProtagonist)
   - `seed-npc-dialogue` (#260 NPC 대사)
   - `seed-npc-flavor` (#267 약한 씬 보강)
   - `seed-omphalos-cameo` (#274 카메오 씬)
   - `seed-ending-aftermath` (#275 후일담)
   - `seed-world-flag-branches` (#272 echo/ashen)
   - `seed-world-flag-matrix` (#276 4 신규 부메랑)
   - `seed-act1-boomerang` (#283 act1 부메랑 3 분기)
   - `seed-npc-names` (#278 NPC 이름 부여)
   - `seed-story-flow-balance` (#284 본문 균형 + Kael 환경 침식)

### 단일 시드 (정확한 patch 만)

```bash
MONGO_URI=mongodb://127.0.0.1:27017/handmade-site node scripts/seed-<name>.mjs
```

## 운영 도구

| 도구 | 명령 | 용도 |
|---|---|---|
| 본문 lint | `pnpm lint:web-adventure` | body 길이 / 문단 / 분기 라벨 |
| 구조 lint | `pnpm lint:web-adventure:structure` | orphan / dead-end / 3분기 / 도달성 |
| 도달성 lint | `pnpm lint:web-adventure:reachability` | 13 conditional 분기 통과 가능성 |
| 백업 | `pnpm backup:web-adventure` | mongo → JSON, 20 회전 |

## painter (외부 의존성)

`painter-*.mjs` — Gemini quota 가용 시. 캐시 파일 `.gitignore` 됨.
