# 통합 옵션 비교

## A. 모델 선택

### Option A — `gemini-2.5-flash-image` (Nano Banana) ★ 추천

- **인증**: 기존 `GEMINI_API_KEY` 그대로
- **가격**: $0.039/image (Batch $0.0195)
- **한국어**: ✅
- **장점**:
  - 채팅 모델 (`gemini-2.5-flash`) 과 **같은 endpoint, 같은 SDK 호출 패턴** → 코드 변경 최소
  - 멀티모달 — 동일 대화 흐름에서 텍스트 + 이미지 혼합 응답 가능
  - 이미지 *편집* 도 지원 (이전 이미지 + 새 prompt 로 변형)
  - 응답 빠름 (3~8초)
- **단점**:
  - 순수 사진 품질은 Imagen 4 Ultra 보다 약간 낮음
  - preview/주력 모델 교체 빈번 (분기마다 ID 확인 필요)

### Option B — `imagen-4.0-fast-generate-001`

- **인증**: 기존 `GEMINI_API_KEY` 그대로
- **가격**: $0.02/image
- **한국어**: ✅
- **장점**: 최저가, 빠름
- **단점**: 전용 이미지 모델 — 별도 endpoint, 채팅 흐름과 분리 필요. 텍스트 응답 없음 (이미지만)

### Option C — `imagen-4.0-generate-001` (Standard)

- **인증**: 기존 `GEMINI_API_KEY` 그대로
- **가격**: $0.04/image
- **한국어**: ✅
- **장점**: 가장 정교한 사진/일러스트 품질
- **단점**: 비용 ↑, 응답 시간 ↑ (~10초)

### Option D — `imagen-3.0-generate-002` ❌ 비권장

- **상태**: **2026-06-24 종료 예정** (3주 후)
- 도입 즉시 마이그레이션 부담만 추가 → 채택 불가

### Option E — Vertex AI Imagen

- **인증**: GCP 프로젝트 + Service Account JSON
- **가격**: AI Studio 와 동일하거나 약간 비쌈
- **장점**: 엔터프라이즈 SLA, VPC-SC, IAM 세분화
- **단점**: 인프라/운영 부담 ↑↑. 사이트 규모 대비 과함.

### Option F — 외부 (DALL-E 3 / Replicate / Flux)

- **인증**: 별도 API key (OPENAI_API_KEY 등) + 별도 결제
- **가격**: DALL-E 3 $0.04~0.08/image, Flux Schnell $0.003/image
- **장점**: 모델 다양성, 가격 옵션
- **단점**:
  - 별도 결제·키 관리
  - SDK 추가 의존성
  - 사이트는 이미 Gemini 생태계 안에 있음 — 분산 시 운영 복잡도 ↑

## A 요약 표

| 항목 | A (Nano Banana) | B (Imagen 4 Fast) | C (Imagen 4 Std) | D (Imagen 3) | E (Vertex) | F (DALL-E 3) |
|---|---|---|---|---|---|---|
| 가격/장 | $0.039 | $0.02 | $0.04 | $0.03 | 동일 | $0.04~ |
| 한국어 prompt | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| 기존 키 재사용 | ✅ | ✅ | ✅ | ✅ | ❌ (SA 필요) | ❌ |
| 멀티모달 채팅 | ✅ | ❌ | ❌ | ❌ | △ | ❌ |
| 운영 부담 | 낮음 | 낮음 | 낮음 | (불가) | 높음 | 중간 |
| 향후 안정성 | 높음 | 높음 | 높음 | **3주 후 종료** | 높음 | 중간 |
| 추천도 | **★** | ☆ | ☆ | ✗ | ✗ | ✗ |

## B. UX 옵션

### UX 1 — 명시 명령어 `/image <prompt>` ★ 추천

```
@enji-bot /image 한국식 정원에서 차를 마시는 고양이
```

- **장점**: 의도 명확, 비용 폭주 위험 낮음, 구현 단순 (route.ts 정규식 분기 1개)
- **단점**: 사용자에게 명령어 학습 부담 — 헬프 텍스트 필요
- **변경 범위**: route.ts 분기 + 컨텍스트 안내 메시지 1줄

### UX 2 — 버튼 토글 (CommentInput)

- CommentInput 에 "이미지" 토글 버튼 추가 → 활성화 시 요청을 image 모드로 보냄
- **장점**: 발견성(discoverability) 좋음
- **단점**: UI 작업 추가, 모바일 입력창 공간

### UX 3 — 자동 키워드 감지 ("그려줘", "draw")

- "그려줘", "그림", "draw", "image" 등 키워드 감지 시 image API 사용
- **장점**: 가장 자연스러운 UX
- **단점**:
  - 오작동 (의도 아닌 호출) → 비용 폭주 위험
  - LLM-as-judge 단계 추가 시 비용/지연 ↑
  - 한국어 표현 다양성 — 정규식만으로는 어려움

### UX 4 — 별도 페이지 `/enji-bot/image`

- 댓글창과 분리된 이미지 생성 전용 페이지
- **장점**: 갤러리/다운로드 UX 풍부하게
- **단점**: 댓글 흐름과 단절 — 컨텍스트(게시글) 활용 의미 약화. 작업량 큼.

## B 요약 표

| UX | 발견성 | 오작동 위험 | 변경 범위 | 추천도 |
|---|---|---|---|---|
| 1. `/image` 명령어 | 중간 | 매우 낮음 | 작음 | **★** |
| 2. 버튼 토글 | 높음 | 낮음 | 중간 | 보조 |
| 3. 자동 키워드 | 높음 | **높음** | 중간 | 비추 |
| 4. 별도 페이지 | 높음 | 낮음 | 큼 | 분리 원할 때 |

## C. 이미지 저장

| 방안 | 장점 | 단점 |
|---|---|---|
| **MinIO 재사용** | 이미 운영 중, 통일된 URL, CDN 캐시 가능 | enji 전용 prefix/bucket 정리 필요 |
| 매번 재생성 | 저장 불필요 | 비용 폭주, 이미지 영속성 X (페이지 새로고침 시 사라짐) |
| 외부 CDN (Cloudinary 등) | 변환/리사이즈 자동 | 비용 추가, 의존성 추가 |

**권장**: MinIO 재사용 (`enji/<year>/<month>/<commentId>.png` prefix).

## D. Comment 스키마 변경

```typescript
// 현재
interface Comment {
  // ...
  isEnji?: boolean;
  content: string;
}

// 추가 후
interface Comment {
  // ...
  isEnji?: boolean;
  content: string;
  imageUrl?: string;        // ← 신규 (MinIO URL)
  imagePrompt?: string;     // ← 옵션 (사용자 prompt 보존)
}
```

- `comment-item.tsx` 의 `c.isEnji` 분기에서 `c.imageUrl` 있으면 `<Image>` 렌더링.
- 다운로드 버튼 — `<a download>` 한 줄.
