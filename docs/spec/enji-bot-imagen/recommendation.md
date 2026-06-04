# 권장 방안

## 결론

**Option A (Nano Banana) + UX 1 (`/image` 명령어) + MinIO 저장 + 일일 50장 한도**

### 이유

1. **Imagen 3 는 도입 불가** — 2026-06-24 종료 (3주 후)
2. **Nano Banana (`gemini-2.5-flash-image`)** 가 enji-bot 의 멀티모달 채팅 흐름과 가장 자연스럽게 통합 — 기존 SDK·API 키 그대로
3. **`/image` 명령어** 가 의도가 명확해 비용 폭주·오작동 위험 최소
4. **MinIO 재사용** 으로 신규 인프라 0

## 구체 사양 (구현 시 참고)

### 환경변수 추가

```bash
ENJI_IMAGE_MODEL=gemini-2.5-flash-image
ENJI_IMAGE_DAILY_LIMIT=50         # 사이트 전체 일일 한도
ENJI_IMAGE_USER_DAILY_LIMIT=5     # 유저당 일일 한도
ENJI_IMAGE_BUCKET=enji-images     # MinIO bucket (or prefix)
```

### route.ts 분기 (의사 코드)

```typescript
const IMAGE_CMD = /^\s*\/image\s+(.+)/i;
const match = query.match(IMAGE_CMD);

if (match) {
  // 1) 일일 한도 체크 (Redis / Mongo counter)
  // 2) 이미지 생성
  const imgRes = await ai.models.generateContent({
    model: env.enjiImageModel,
    contents: match[1].trim(),
  });
  // 3) base64 → MinIO 업로드 → publicUrl
  // 4) saveEnjiComment(postId, parentId, "🎨 생성 완료", { imageUrl: publicUrl })
} else {
  // 기존 텍스트 흐름
  void callGemini(contextMessage).then(...)
}
```

### Comment 스키마

```typescript
// webapp/src/models/comment.ts
const CommentSchema = new Schema({
  // ...
  imageUrl: { type: String, default: null },
  imagePrompt: { type: String, default: null },
});
```

### UI 변경

- `comment-item.tsx` 에서 `c.isEnji && c.imageUrl` 시 `<Image>` + 다운로드 버튼 + "✨ AI 생성" 라벨
- `comment-input.tsx` placeholder 에 힌트: "이미지 요청은 `/image 프롬프트`"

### Fallback

- 한도 초과: "오늘의 이미지 생성 한도를 모두 사용했어요. 내일 다시 시도해 주세요."
- 안전 필터 거부: "죄송해요, 그 요청은 처리할 수 없어요. 다른 prompt 를 시도해 주세요."
- API 장애: 기존 텍스트 fallback 메시지 재사용

## 작업 예상 시간

| 단계 | 예상 |
|---|---|
| Google Cloud billing 등록 + Tier 1 활성 | 0.5d (사용자 직접) |
| Comment 스키마 + 마이그레이션 | 0.5d |
| `/api/enji` 분기 + image SDK 호출 + MinIO 업로드 | 1d |
| 일일 한도 카운터 (Mongo 또는 Redis) | 0.5d |
| UI (`comment-item` 이미지 렌더 + 다운로드 + 라벨) | 0.5d |
| Safety fallback + 에러 메시지 | 0.5d |
| TDD red→green 테스트 (route + UI) | 1d |
| 배포 + 모니터링 | 0.5d |
| **합계** | **약 5일 (1주)** |

## 월 예상 비용

| 시나리오 | 월 비용 |
|---|---|
| **권장 한도 (일 50장 ceiling)** | **최대 $58.50 / 약 80,700원** |
| 평균 (일 20장 가정) | $23.40 / 약 32,300원 |

추가로:

- MinIO 디스크: 무시 가능 (~2GB/월)
- 네트워크 전송: 무시 가능
- 결제 카드 등록 시 최소 결제 요구 없음

## 다음 결정 필요 사항

| 결정 항목 | 옵션 | 영향 |
|---|---|---|
| 결제 등록 진행 여부 | Y/N | Y 면 본 작업 진행, N 이면 보류 |
| 일일 한도 값 | 30/50/100 | 비용 ↑↓ |
| 유저당 한도 값 | 3/5/10 | 어뷰징 위험 ↑↓ |
| 이미지 보존 기간 | 영구 / 30일 / 7일 | 스토리지 ↑↓ |
| 부적절 prompt 필터 | block list / LLM judge / 없음 | 안전성 ↑↓, 비용 ↑↓ |
| `/image` 외 UX 추가 여부 | 버튼 추가 Y/N | 작업 시간 +0.5d |

## 미채택 옵션 요약

- **Imagen 3 (D)**: 2026-06-24 종료 — 즉시 마이그레이션 부담만 추가
- **Imagen 4 (B/C)**: 가격 매력적이지만 채팅 흐름과 분리 필요 → enji-bot 컨텍스트(게시글) 활용 약화. 추후 별도 페이지(UX 4) 만들 때 재검토.
- **Vertex AI (E)**: 인프라 과함. 트래픽 큰 엔터프라이즈에서 재검토.
- **외부 (F)**: Google 생태계 통일성 깸. 다양성 필요 시 추후 추가.
