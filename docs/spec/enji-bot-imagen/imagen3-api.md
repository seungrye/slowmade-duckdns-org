# Imagen / Gemini Image API 분석

> 조사 시점: 2026-06-05. 가격/모델 ID 는 분기마다 바뀌므로 도입 시점에 재확인 필요.

## ⚠️ 핵심: Imagen 3 는 종료 예정

`imagen-3.0-generate-002` 를 비롯한 **모든 Imagen 3 변종은 2026-06-24 (또는 2026-06-30) 에 종료** 예정. 새로 도입할 모델이 아님.

> 출처: [Imagen 3 deprecation guide](https://tokenmix.ai/blog/imagen-3-0-generate-002-deprecated-migration-guide-2026)

대신 다음 두 계열 중 선택:

1. **Gemini Image 계열** (멀티모달 통합) — `gemini-2.5-flash-image` (Nano Banana)
2. **Imagen 4 계열** (전용 이미지 모델) — `imagen-4.0-*-generate-001`

## 모델 ID 와 가격

| Model ID | 별칭 | 1장 가격 (Standard) | Batch (50% 할인) | 비고 |
|---|---|---|---|---|
| `gemini-2.5-flash-image` | Nano Banana | $0.039 | $0.0195 | 채팅과 같은 endpoint, 멀티모달 |
| `gemini-3.1-flash-image-preview` | Nano Banana 2 | $0.045 (0.5K) ~ $0.151 (4K) | $0.022 ~ $0.076 | preview, 2026-02 출시 |
| `gemini-3-pro-image-preview` | Nano Banana Pro | $0.134 (1K/2K), $0.24 (4K) | $0.067 / $0.12 | 최고 품질 + 다국어 텍스트 렌더 |
| `imagen-4.0-fast-generate-001` | Imagen 4 Fast | $0.02 | n/a | 최저가, 빠름 |
| `imagen-4.0-generate-001` | Imagen 4 Standard | $0.04 | n/a | 균형 |
| `imagen-4.0-ultra-generate-001` | Imagen 4 Ultra | $0.06 | n/a | 최고 품질 |
| ~~`imagen-3.0-generate-002`~~ | ~~Imagen 3~~ | ~~$0.03~~ | — | **종료 예정** |

> 출처: [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing), [aifreeapi 비교](https://www.aifreeapi.com/en/posts/gemini-image-generation-api-pricing)

## 인증

- **Google AI Studio API key** = `GEMINI_API_KEY`
- **enji-bot 이 이미 사용 중인 그 키** 로 Imagen 4 / Gemini Image 모두 호출 가능
- 별도 GCP 프로젝트 / Service Account 불필요 (Vertex AI 만 그것이 필요)
- 코드:
  ```typescript
  import { GoogleGenAI } from "@google/genai";
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: "한국식 정원에서 차를 마시는 고양이",
  });
  // response.candidates[0].content.parts[*].inlineData.data → base64 PNG
  ```

## 응답 형식

- `inlineData.data` = base64 PNG
- 디코드: `Buffer.from(part.inlineData.data, "base64")`
- 1회 호출에 N장 (보통 1~4장) 생성 가능 (모델별 옵션)

## 한국어 prompt 지원

| 모델 | 한국어 prompt |
|---|---|
| Imagen 3 | ❌ 영어만 |
| Imagen 4 Fast/Standard/Ultra | ✅ 한국어 공식 지원 |
| Gemini 2.5 Flash Image (Nano Banana) | ✅ 멀티모달 — 한국어 OK |
| Gemini 3 Pro Image (Nano Banana Pro) | ✅ 다국어 텍스트도 정확히 렌더 |

> 출처: [What is Imagen 4 Fast — MindStudio](https://www.mindstudio.ai/blog/what-is-imagen-4-fast-google), [Nano Banana 가이드 — DataCamp](https://www.datacamp.com/tutorial/gemini-2-5-flash-image-guide)

## Rate limit / Quota

| Tier | IPM (이미지/분) | 비고 |
|---|---|---|
| Free | 0 | 이미지 모델은 무료 등급 없음 — 즉시 429 |
| Tier 1 (결제 등록) | 10 IPM | 최소 결제 없음 |
| Tier 2 | 20 IPM | |
| Tier 3 (Enterprise) | 100+ IPM | |

- IPM 은 60초 sliding window. 1회 호출 4장 = 4 IPM.
- 프로젝트 단위 (API key 단위 아님)

> 출처: [Gemini API Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)

**결론**: 이미지 기능을 쓰려면 **결제 정보 등록 (Tier 1 이상)** 필수. 사이트의 현재 Gemini 사용이 무료 등급이라면 결제 등록 단계가 추가됨.

## 안전 / 정책

### SynthID 워터마크 (강제)

- 모든 Imagen / Gemini Image 생성물에 **SynthID 디지털 워터마크 자동 삽입** (보이지 않지만 검출 가능)
- 제거 불가능 (픽셀 생성 시 임베드)
- 한국 법규 ("생성형 AI 결과물 표기 의무") 와도 부합

### 콘텐츠 필터

- Imagen: `personGeneration` 파라미터로 인물 생성 제한 가능 (`dont_allow`, `allow_adult`, `allow_all`)
- Nano Banana 2 부터 (2026-02) 안전 필터 대폭 강화:
  - 유명인 합성 금지
  - 금융 정보 변조 금지
  - 의상/얼굴 스와핑 강한 제약
  - 암묵적 선정성 금지
- 거부 시 종종 명시 에러 없이 무응답 → **fallback UX 필요**

### 한국 지역 가용성

- Google AI Studio / Gemini API 는 한국에서 사용 가능
- 결제 등록은 가능 (USD billing)
- Imagen 의 `personGeneration: allow_all` 일부 지역 제한 있지만 한국은 영향 없음 (영국/EU 제한)

## 응답 시간

- Nano Banana: 보통 3~8초
- Imagen 4 Fast: 3~5초
- Imagen 4 Ultra: 10~20초
- enji-bot 은 이미 백그라운드 + 폴링 패턴이라 응답 시간 UX 영향 적음
