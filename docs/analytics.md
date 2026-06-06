# Firebase Analytics 운영 가이드

## 이벤트 확인 방법

Firebase Analytics에는 이벤트를 보는 곳이 두 군데 있고, 동작 방식이 **완전히 다르다**.

| | DebugView | Events 탭 |
|---|---|---|
| 위치 | Analytics → DebugView | Analytics → Events |
| 데이터 | `debug_mode: true` 이벤트만 | 프로덕션 이벤트만 |
| 반영 속도 | 실시간 | 24~48시간 후 |
| 용도 | 개발 중 동작 확인 | 실제 사용자 통계 |

> **핵심**: `debug_mode: true`로 전송된 이벤트는 DebugView에만 보이고 Events 탭에는 **집계되지 않는다**.
> Firebase가 의도적으로 분리해 놓은 것 — 테스트 데이터가 프로덕션 통계를 오염시키지 않도록.

## 환경별 동작

| 환경 | debug_mode | DebugView | Events 탭 |
|---|---|---|---|
| `pnpm dev` | `true` (자동) | ✅ 실시간 | ❌ |
| `pnpm build && pnpm start` | `false` | ❌ | ✅ 24~48시간 후 |
| 프로덕션 + `?debug_mode=1` URL | false (SDK) | ✅ 해당 세션만 | ❌ |

## 현재 수집 중인 이벤트

### `page_view`
- **발생 시점**: 페이지 이동 시마다
- **파라미터**: `page_path`, `page_title`, `page_location`
- **구현**: `webapp/src/components/firebase-analytics.tsx`

### `scroll_depth`
- **발생 시점**: 포스트 페이지에서 25%, 50%, 75%, 100% 스크롤 도달 시
- **파라미터**: `percent_scrolled`, `post_id`, `post_title`
- **특징**: 구간당 페이지 방문 1회만 전송 (중복 없음)
- **구현**: `webapp/src/components/post-scroll-depth.tsx`

### Web Adventure — `adv_*` 이벤트 (#245 / #273)

〈에테르니아의 추락〉 게임의 핵심 모먼트.

| 이벤트 | 발생 시점 | 파라미터 |
|---|---|---|
| `adv_run_started` | 캐릭터 생성 → START_GAME | `ability`, `protagonist`, `run_index` |
| `adv_choice_made` | 선택지 클릭 | `scene_id`, `choice_id`, `choice_kind` |
| `adv_ending_reached` | ended 진입 | `ending_id`, `run_index`, `protagonist`, `stigma_erosion` |
| `adv_petrification_auto` | 침식 100 자동 전환 | `protagonist`, `run_index` |
| `adv_stigma_critical` | 침식 80 첫 도달 (회차당 1) | `protagonist`, `run_index`, `stigma_erosion` |
| `adv_world_flag_applied` | 회차 부메랑 flag 가 적용된 새 회차 | `flags`, `flag_count`, `run_index` |
| `adv_save_persisted` | 서버 자동 저장 성공 | `scene_id`, `run_index` |
| `adv_gallery_view` | 갤러리 페이지 방문 | (none) |

- **구현**: `webapp/src/lib/web-adventure/analytics.ts` + 발화는 `play/page.tsx`, `use-auto-save.ts`, `gallery/page.tsx`.

### Performance Monitoring (자동 수집)
- **수집 항목**: 페이지 로드 시간(FCP, FID), 네트워크 요청 타이밍(fetch/XHR)
- **확인 위치**: Firebase Console → Performance
- **구현**: `webapp/src/components/firebase-performance.tsx`
- **참고**: Analytics와 달리 별도 이벤트 전송 없이 SDK 초기화만으로 자동 수집

## Events 탭에서 확인하는 법

1. 프로덕션에 배포
2. 실제 사용자(또는 본인)가 페이지 방문·스크롤
3. 24~48시간 대기
4. Firebase Console → Analytics → Events → 이벤트명 클릭
