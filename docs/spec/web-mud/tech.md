# 기술 스택 결정

## 결론 (추천)

> **Next.js Server Action + MongoDB 저장 + 클라이언트 React state + CC0 도트 자산**

- 별도 WebSocket 서버 X
- 별도 SSE 엔드포인트 X (MVP)
- 게임 상태는 *클라이언트 메모리* + *mongo 자동 저장*
- 일러스트는 *공개 CC0 도트* (MVP) → *본격 의뢰* (Post-MVP)
- 선택지 클릭 모델이라 *입력 파서 없음*

## 옵션 비교

### D. 기술 스택 비교 표 (재확인)

| 옵션 | 통신 모델 | 운영 부담 | 멀티 지원 | 사이트 일관성 | 추천 |
|------|----------|----------|----------|--------------|------|
| **(1) 클라이언트 only** | 없음 (브라우저 내) | 매우 낮음 | X | △ — DB 미사용 | △ — fallback only |
| (2) 실시간 WebSocket | socket.io / ws | 높음 | ◎ | ✗ — 사이트는 RSC 중심 | ✗ |
| **(3) Server Action + Mongo** | HTTP RSC action | 낮음 | △ (비동기 흔적) | ★ — 사이트와 동일 | **★ 추천** |
| (4) SSE | EventSource | 중간 | △ (브로드캐스트) | ○ — Next.js route | △ — Post-MVP |

### 옵션별 상세

#### (1) 클라이언트 only
- *장점*: 가장 단순. 정적 호스팅.
- *단점*: 저장이 *브라우저* 에만 → 디바이스 바뀌면 진행도 사라짐. *회차 통계 * 와 충돌.
- *판정*: △ — *비로그인 fallback* 으로만 채택 (localStorage)

#### (2) 실시간 WebSocket
- *장점*: 다른 플레이어와 같은 씬에 있을 수 있음.
- *단점*:
  - Next.js RSC + serverless 모델과 *충돌* — 별도 Node.js 프로세스 필요
  - 사이트 systemd / nginx 배포 절차에 *새 서비스* 추가
  - **CYOA 는 본질적으로 싱글** — 멀티 가치 < 운영 비용
- *판정*: ✗

#### (3) Server Action + Mongo (★ 추천)
- *장점*:
  - 사이트 기존 패턴(`webapp/src/app/api/...`, mongo Model) 그대로 사용
  - 게임 로직은 *클라이언트* 에서 돌고, 저장만 server action 으로 mongo flush
  - Firebase Auth 통합 그대로
  - 배포 절차 변경 X (Blue/Green 그대로)
  - 게임 상태가 *유저별 doc* 이라 멀티 충돌 없음
- *단점*: 실시간 멀티 불가. 다른 유저 행동을 *즉시* 볼 수 없음.
- *판정*: ★ **추천**

#### (4) SSE
- *장점*: 단방향 푸시. 비동기 흔적 / 공지 / 엔딩 클리어 알림 등에 fit.
- *단점*: Next.js route handler 에서 `ReadableStream` 필요.
- *판정*: △ — Post-MVP. *전 세계 엔딩 클리어 알림* 같은 부수 기능에만.

## E. 그래픽 자산 — 도트 일러스트

### MVP — 공개 CC0 자산 활용

| 옵션 | 비용 | 작업량 | 품질 | 추천 |
|------|------|--------|------|------|
| ASCII / 무 그래픽 | 0 원 | 0 | △ — *모험가 이야기 톤* 못 살림 | ✗ |
| **(2) CC0 도트 + Tailwind 색감** | **0 원** | **1~2 일 자산 선별** | **○ — 무난** | **★ 추천 (MVP)** |
| (3) 본격 의뢰 | 1,000~2,000 USD | 4~6 주 외주 | ◎ | Post-MVP |
| (4) AI 생성 | $20/월 | 1 주 생성·검수 | △ — *도트 일관성* 어려움 | ✗ (저작권·일관성) |

### CC0 자산 추천 출처

| 출처 | 종류 | 비고 |
|------|------|------|
| [itch.io CC0 + Pixel Art](https://itch.io/game-assets/free/tag-cc0/tag-pixel-art) | 종합 검색 | 가장 풍부 |
| [PIPOYA RPG Character Sprites](https://pipoya.itch.io/) | 캐릭터 32×32 | NPC 도트 |
| [Clockwork Raven 5600 Icons](https://clockworkraven.itch.io/5600-ultimate-pixel-art-fantasy-rpg-icon-pack) | 아이템 16×16 | 인벤토리 아이콘 (유료지만 저렴) |
| [Kenney.nl](https://kenney.nl/assets) | UI / 환경 | CC0 라이브러리 |
| [OpenGameArt.org](https://opengameart.org/) | 종합 | CC0 / CC-BY 필터링 필요 |

### 자산 가공 파이프라인

```
1. CC0 도트 다운로드 (씬 카테고리당 1~2 장)
2. 한국 톤 보정 (단청 색감 +) — Photopea / Aseprite 로 색 조정
3. 16:9 비율로 트리밍 / 확장 (단색 배경 + 캐릭터 합성)
4. webapp/public/web-adventure/scenes/*.png 저장 (768 × 432)
5. Next.js Image 컴포넌트로 lazy load
```

### Post-MVP — 본격 도트 의뢰

- 외주 candidate:
  - 한국 도트 일러스트레이터 (네이버 / 트위터 / 디스코드 구인)
  - itch.io 작가 직접 컨택
  - Fiverr 픽셀 아티스트
- 견적: 씬당 30~50 USD × 30~40 씬 ≈ 1,000~2,000 USD
- 일관성을 위해 *한 작가* 에게 전체 의뢰 권장
- 스타일 referent: *Roadwarden*, *모험가 이야기*, *Stardew Valley*

## 라이브러리 / 의존성 (권장만 — 실제 설치는 사용자 결정 시)

| 카테고리 | 선택 | 이유 |
|---------|------|------|
| 상태 관리 | React useReducer + Context | 게임 reducer pattern. zustand 도 가능. |
| 저장 (서버) | mongoose 모델 (기존 패턴) | 사이트와 일관. |
| 저장 (클라) | localStorage (직접) | 비로그인 fallback. |
| 이미지 | Next.js `<Image>` | 자동 lazy / WebP 변환 |
| 폰트 | Pretendard (`@fontsource/pretendard`) | 한국어 둥글림 sans |
| 인증 | Firebase Auth (기존) | 사이트 통합 |
| 분석 | Firebase Analytics (기존) | 회차/엔딩 이벤트 |
| 애니메이션 | `framer-motion` (선택) 또는 CSS only | 씬 전환 페이드 |
| 마크다운 (본문) | `react-markdown` (선택) 또는 직접 토큰화 | 본문 내 강조 표기 |

### 컨텐츠 데이터 — 직접 구현 (TS 정적 객체)

```ts
// webapp/src/games/web-adventure/content/scenes/index.ts
export const SCENES: Record<string, Scene> = {
  town_square_dawn: townSquareDawn,
  market_morning: marketMorning,
  elder_house: elderHouse,
  // ...
};

export function getScene(id: string): Scene {
  const scene = SCENES[id];
  if (!scene) throw new Error(`Scene not found: ${id}`);
  return scene;
}
```

## 코드 배치 (사이트 구조 따름)

```
webapp/
  src/
    app/
      games/
        web-adventure/         ← URL 경로 (폴더는 web-mud 인 docs 와 별개로, 코드는 의미 우선)
          page.tsx              ← 게임 진입점 (RSC, 캐릭터 생성 / 이어하기)
          play/
            page.tsx            ← 플레이 화면 (CSR)
          gallery/
            page.tsx            ← 엔딩 갤러리
      api/
        web-adventure/
          save/
            route.ts            ← POST 저장
          load/
            route.ts            ← GET 진행도
          ending/
            route.ts            ← POST 엔딩 기록
    games/
      web-adventure/
        engine/
          reducer.ts            ← 게임 state reducer
          rollDice.ts           ← d20 판정
          choiceFilter.ts       ← 조건 / 확률 필터
          endingResolver.ts     ← 엔딩 조건 판정
        content/
          scenes/
            town_square_dawn.ts
            market_morning.ts
            elder_house.ts
            ...                 ← 30~40 개
          items.ts              ← 아이템 정의
          npcs.ts               ← NPC 정의 (대사는 씬 내장)
          abilities.ts          ← 어빌리티 정의
          endings.ts            ← 엔딩 에필로그 텍스트
        components/
          GameScreen.tsx        ← 메인 화면
          SceneRenderer.tsx     ← 일러스트 + 텍스트
          ChoiceList.tsx        ← 선택지 버튼 리스트
          StatusPanel.tsx       ← 사이드 패널 (스탯/HP/인벤/회차)
          CharacterCreator.tsx  ← 캐릭터 생성
          EndingScreen.tsx      ← 엔딩 화면
          MobileDrawer.tsx      ← 모바일 햄버거
        hooks/
          useGameState.ts
          useAutoSave.ts
    models/
      webAdventureSave.ts       ← Mongo 모델 (current run)
      webAdventurePastRuns.ts   ← 과거 회차 누적
    types/
      web-adventure.ts          ← 게임 타입 (Scene / Choice / Stat...)
    lib/
      web-adventure/
        bootstrap.ts            ← 초기 state 생성
        save-sync.ts            ← localStorage ↔ mongo
        statRoll.ts             ← 확률 판정 공식
```

> 참고: 기획서 폴더 `docs/spec/web-mud/` 는 URL/git 일관성으로 *이름 유지*. 코드 폴더 `webapp/src/games/web-adventure/` 는 *의미 우선* — 새 코드라 부담 적음.

## 보안 / 인증

- 비로그인: anon `sessionKey` (`crypto.randomUUID()` localStorage 저장)
- 로그인: Firebase ID token Bearer (사이트 기존 인증 패턴)
- 저장 API:
  - `POST /api/web-adventure/save` → 본인 doc 만 upsert
  - `GET /api/web-adventure/load` → 본인 doc 만 read
  - `POST /api/web-adventure/ending` → 엔딩 기록 + 회차 +1
- Server 에서 인증 미들웨어 (`requireFirebaseAuth` 또는 `acceptAnonSession`)
- 비로그인 → 로그인 전환 시: 1 회 마이그레이션 endpoint (`POST /api/web-adventure/claim-anon`)
- **확률 판정은 *서버 검증* 불필요** — 싱글 게임이라 *클라이언트 d20 굴림* 으로 충분. 어차피 *재시작* 자유.

## 성능

- 컨텐츠는 정적 import → 코드 분할 (`/games/web-adventure/play` 만 로드)
- 일러스트는 lazy load + WebP
- mongo 저장은 *디바운스 1 초* (씬 이동 시)
- 씬 렌더링은 React Server Components 미사용 (CSR — 클릭 응답성 우선)

## 모바일

- 입력창 없음 (선택지 클릭 only) → 가상 키보드 이슈 없음
- 일러스트는 *디바이스 폭* 기준 적절 리사이즈 (`sizes` 속성)
- iOS Safari 의 viewport 처리 → `100dvh`
- 탭 영역 최소 56 × 56 px (선택지 버튼)

## 테스트

- reducer: 단위 테스트 (시나리오: 캐릭터 생성 → 씬 진행 → 엔딩 도달)
- 확률 판정: `seedrandom` 으로 결정론적 테스트
- API: 통합 테스트 (mongo memory server)
- 회귀: 6 엔딩 모두 *씬 ID 시퀀스* 로 자동 도달 테스트

```ts
// 예: 메인 엔딩 자동 시퀀스 테스트
const path = [
  "town_square_dawn",      // choice: go_market
  "market_morning",        // choice: find_receipt (꿀팁: roll 성공)
  "town_square_dawn",      // choice: go_elder
  "elder_house",           // choice: accept_quest
  ...
  "elder_house_reward",
];
expect(playScript(path).ending).toBe("main");
```

## 배포

- 사이트 기존 Blue/Green 그대로
- 마이그레이션: `webAdventureSaves`, `webAdventurePastRuns` 컬렉션 신규 생성
  - 인덱스: `{ userId: 1 }`, `{ sessionKey: 1 }`, `{ "completedEnding": 1 }` (분석용)
- 환경변수: 추가 없음 (기존 `MONGODB_URI`, Firebase 변수 재사용)
- 정적 자산: `webapp/public/web-adventure/scenes/*.png` (Next.js 자동 서빙)

## 모니터링

- Firebase Analytics 이벤트:
  - `adv_run_started` (회차, 로그인 여부, 어빌리티)
  - `adv_scene_entered` (씬 ID — sampled 5 %)
  - `adv_choice_made` (선택지 ID, kind, roll 결과)
  - `adv_roll_outcome` (스탯, 난이도, 성공 여부, 재굴림 사용)
  - `adv_ending_reached` (엔딩 타입, 플레이 시간, 회차, 씬 본 갯수)
  - `adv_player_died` (씬, HP 도달 경위)
- 백엔드 로그: API 오류만 (정상은 X — 노이즈)
- 후속 분석 쿼리: *씬별 머문 시간 / 가장 많이 본 엔딩 / 미달성 엔딩*
