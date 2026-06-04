# enji-bot 이미지 생성 통합 — 검토 (#198)

> **상태**: 검토 단계. 구현/배포 변경 없음. 사용자 결정용 문서.
> **작성일**: 2026-06-05

## 한 줄 요약

현재 enji-bot 은 Gemini 2.5 Flash 채팅만 사용. **같은 `GEMINI_API_KEY` 로 `gemini-2.5-flash-image` (Nano Banana) 를 추가 호출**하면 이미지 생성 기능을 비교적 적은 변경으로 통합할 수 있다. 단, Imagen 3 (`imagen-3.0-generate-002`) 는 **2026-06-24 종료 예정**이므로 새로 도입할 모델이 아니다.

## 결정 옵션 (한눈에 보기)

| 옵션 | 모델 | 인증 | 이미지당 단가 | 한국어 prompt | 권장도 |
|---|---|---|---|---|---|
| A | `gemini-2.5-flash-image` (Nano Banana) | 기존 `GEMINI_API_KEY` 재사용 | $0.039 | 가능 (멀티모달) | **★ 추천** |
| B | `imagen-4.0-fast-generate-001` | 기존 `GEMINI_API_KEY` 재사용 | $0.02 | 가능 | 차선 |
| C | `imagen-4.0-generate-001` (Standard) | 기존 `GEMINI_API_KEY` 재사용 | $0.04 | 가능 | 품질 우선 시 |
| D | `imagen-3.0-generate-002` | 기존 `GEMINI_API_KEY` 재사용 | $0.03 | 영어만 | **불가 (2026-06-24 종료)** |
| E | Vertex AI Imagen | GCP SA + Project | 동일/유사 | 가능 | 과한 인프라 |
| F | DALL-E 3 / Replicate 등 외부 | 별도 API key | $0.04~ | 가능 | 별도 결제 부담 |

## UX 옵션 (한눈에 보기)

| UX | 트리거 | 변경 범위 | 권장도 |
|---|---|---|---|
| 1 | `@enji-bot /image <prompt>` 명령어 | 작음 (route.ts 분기만) | **★ 추천** |
| 2 | "이미지 생성" 버튼 (CommentInput 토글) | 중간 (UI + route 분기) | 보조 |
| 3 | 자동 키워드 감지 ("그려줘", "그림") | 중간 (LLM judge 필요) | 비추 (오작동) |
| 4 | 별도 페이지 `/enji-bot/image` | 큼 (새 라우트/페이지) | 분리 원할 때 |

## 권장 한 줄

**Option A (Nano Banana) + UX 1 (`/image` 명령어) + 인라인 댓글 표시 + 일일 50장 한도**.

자세한 분석:

- [current-state.md](./current-state.md) — 현 enji-bot 구조
- [imagen3-api.md](./imagen3-api.md) — Imagen / Gemini Image API 분석
- [integration-options.md](./integration-options.md) — A/B/C/D 모델 + UX 옵션 비교
- [risk-cost.md](./risk-cost.md) — 안전/비용 평가
- [recommendation.md](./recommendation.md) — 권장 방안 + 예상 작업/비용

## 주요 참고 출처

- [Gemini API — Imagen docs](https://ai.google.dev/gemini-api/docs/imagen)
- [Gemini API — Image generation](https://ai.google.dev/gemini-api/docs/image-generation)
- [Gemini API — Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini 2.5 Flash Image (Nano Banana) — Developers Blog](https://developers.googleblog.com/en/introducing-gemini-2-5-flash-image/)
- [Imagen 3 deprecation guide](https://tokenmix.ai/blog/imagen-3-0-generate-002-deprecated-migration-guide-2026)
- [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
- [SynthID watermark](https://deepmind.google/models/synthid/)
