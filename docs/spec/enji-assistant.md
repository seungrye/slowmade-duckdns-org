# @enji 비서 — 댓글 AI 어시스턴트 ✅

## 개요

댓글 작성창에서 `@enji`를 포함한 댓글을 제출하면, AI 어시스턴트 "enji"가 게시글/댓글 컨텍스트를 바탕으로 자동 응답한다.

---

## 동작 흐름

1. 사용자가 댓글 작성창에 `@enji ...` 포함 텍스트를 입력하고 제출
2. 클라이언트가 `@enji` 감지 → `/api/enji` 호출 (일반 `/api/comments` 대신)
3. `/api/enji` 서버가:
   a. 사용자 댓글을 DB에 저장
   b. 해당 게시글 제목 + 본문(htmlContent, 3000자 이하) + 최근 댓글 20개를 컨텍스트로 구성
   c. Gemini API 호출 (server-side, `@google/generative-ai`)
   d. enji 응답 댓글을 `isEnji: true`, `author: "enji"`, `parentId: <사용자 댓글 _id>` 로 저장
   e. 사용자 댓글 + enji 댓글 반환
4. 클라이언트가 댓글 목록 갱신

---

## enji 페르소나

- 이름: **enji**
- 말투: 친근하고 유머가 있되 도움이 되는 답변
- 한국어로 응답 (사이트 언어 기준)
- 게시글 내용을 참고해 답변, 관련 글 언급 가능

---

## 모델 변경

### `Comment` 스키마 (`webapp/src/models/comment.tsx`)
```
isEnji: { type: Boolean, default: false }
```

### `Comment` 타입 (`webapp/src/types/comment.d.ts`)
```
isEnji?: boolean;
```

---

## API 설계

### `POST /api/enji`

**Request body:**
```json
{
  "postId": "string",
  "parentId": "string | null",
  "content": "string",
  "anonid": "string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userComment": { ...Comment },
    "enjiComment": { ...Comment }
  }
}
```

**에러 케이스:**
- `content` 없음 → 400
- `postId` 없거나 게시글 없음 → 400 / 404
- Gemini API 실패 → 500 (사용자 댓글은 이미 저장된 상태)

---

## 환경 변수

```
GEMINI_API_KEY=<Google AI Studio에서 발급>
```

`env.ts`에 `geminiApiKey` 추가.

---

## 컴포넌트 변경

### `use-comments.ts`
- `submitComment` 내부에서 content에 `@enji` 포함 시 `/api/enji` 호출
- 반환된 userComment + enjiComment를 comments 배열에 낙관적 추가 또는 fetchComments 재호출

### `comment-item.tsx`
- `c.isEnji === true` 이면 특별 스타일 적용:
  - 보라색 계열 테두리 + 배경
  - 작성자 이름 앞에 ✨ 이모지 또는 로봇 아이콘
  - Reply/Delete 버튼 숨김

---

## 구현 범위 외 (v1 제외)

- 스트리밍 응답 (SSE)
- @enji 멘션 자동완성 UI
- enji 댓글 좋아요/신고
- 컨텍스트에 타 게시글 검색 (RAG)

---

## SDK 마이그레이션 — @google/generative-ai → @google/genai ✅

구 SDK(`@google/generative-ai`)를 신 SDK(`@google/genai`)로 교체한다.

### 변경 사항
- `@google/generative-ai` 제거, `@google/genai` 설치
- `GoogleGenerativeAI` → `GoogleGenAI`
- `genAI.getGenerativeModel(...)` → `ai.models.generateContent(...)`
- `result.response.text()` → `response.text`
- 테스트 모킹 방식 동일하게 업데이트

---

## 모델 변경 — gemini-2.0-flash → gemini-flash-latest

`gemini-2.0-flash`는 Spark 플랜 무료 쿼터가 0이라 동작하지 않음.
`gemini-flash-latest`로 변경하면 무료 쿼터 사용 가능.
