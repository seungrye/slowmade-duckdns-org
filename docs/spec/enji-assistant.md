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

## enji 댓글에 Reply — 대화 이어가기 ✅

enji가 남긴 댓글에 Reply 버튼을 노출하여 대화를 이어갈 수 있게 한다.

### 동작
1. enji 댓글 블록에 **Reply** 버튼 추가
2. 버튼 클릭 시 CommentInput 표시
3. 사용자가 내용 입력 후 제출 → 서버는 해당 댓글을 enji에게 보내는 것으로 처리
4. 클라이언트는 폴링으로 enji 응답 대기

### 구현 포인트
- `comment-item.tsx`: enji 블록에 Reply 버튼 + `openReplyFor` 처리 추가
- `use-comments.ts`: `submitComment(parentId, content, parentIsEnji?)` — `parentIsEnji=true` 이면 content에 `@enji` 유무와 무관하게 `/api/enji` 호출
- `comments.section.tsx`: `handleReplySubmit` 에서 부모 댓글이 enji면 `parentIsEnji=true` 전달

---

## enji 호출 — 로그인 사용자 전용 ✅

Gemini API 쿼터 보호를 위해 @enji 호출은 로그인한 사용자만 가능하게 한다.

### 변경 동작
- **BE**: `POST /api/enji` 에서 session 확인 → 미로그인 시 401 반환
- **FE 멘션 목록**: `CommentInput`에 전달하는 mentions 배열에서 `session`이 없으면 `enji` 제외
- **FE submitComment**: 로그인 여부 체크는 BE에 위임 (FE에서 별도 처리 없음)

### 변경 파일
- `webapp/src/app/api/enji/route.ts`: session 없으면 401
- `webapp/src/app/post/view/[[...id]]/comments.section.tsx`: session 없으면 mentions에서 enji 제외

---

## @ 멘션 목록 — enji + 회원만 표시

`@` 멘션 드롭다운에 `enji`와 계정이 있는 댓글 작성자(회원)만 표시한다.
익명 댓글 작성자는 `authorId`가 null이므로 제외.

### 목록 구성
- **@enji** — 로그인 사용자에게만 표시
- **@회원** — `authorId != null` 인 댓글 작성자 (로그인 여부 무관)
- **익명** — 표시 안 함

### 변경 파일
- `comments.section.tsx`: mentions를 authorId != null 필터링으로 변경

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

## 모델 변경 — gemini-2.0-flash → gemini-flash-latest ✅

`gemini-2.0-flash`는 Spark 플랜 무료 쿼터가 0이라 동작하지 않음.
`gemini-flash-latest`로 변경하면 무료 쿼터 사용 가능.

---

## @ 멘션 자동완성 ✅

댓글 입력창에서 `@`를 입력하면 드롭다운이 뜨고, 이름을 선택하면 자동 삽입된다.

### 동작
1. textarea에서 `@` 입력 → 드롭다운 표시
2. `@` 뒤 텍스트로 목록 필터링 (대소문자 무시)
3. 항목 클릭 또는 Enter/↑↓ 키 → `@이름 ` 삽입 후 드롭다운 닫힘
4. Escape 또는 포커스 이탈 → 드롭다운 닫힘

### 목록 구성
- **@enji** — 항상 첫 번째
- 현재 게시글 댓글 작성자 (중복 제거, isEnji 제외, isDeleted 제외)

### 컴포넌트 변경

#### `CommentInput`
- `mentions?: string[]` prop 추가
- `@` 감지 후 드롭다운 렌더링 (textarea 아래 absolute 위치)

#### `comments.section.tsx`
- `['enji', ...유니크댓글작성자]` 를 CommentInput에 전달

### 키보드 지원
- `↑` / `↓`: 항목 이동
- `Enter`: 선택
- `Escape`: 닫기

---

## 비동기 응답 — 댓글 즉시 노출 ✅

### 문제
`/api/enji` 가 Gemini 응답을 기다린 뒤 반환해서 체감 응답이 느림.

### 변경 동작
1. `/api/enji` → 사용자 댓글 저장 후 **즉시** `{ userComment }` 반환
2. Gemini 호출은 서버에서 fire-and-forget (void)
3. 클라이언트: 즉시 `fetchComments()` → 사용자 댓글 노출
4. 클라이언트: 2초 간격으로 최대 30초간 폴링 → enji 답변 나타나면 중단

### 변경 파일
- `webapp/src/app/api/enji/route.ts` — Gemini 호출을 void로 분리
- `webapp/src/hooks/use-comments.ts` — @enji 제출 후 폴링 로직

### 상세 동작 (서버)
- Gemini 호출과 1.5초 타이머를 `Promise.race`
- **429 즉시** → `enjiSleeping: true` 반환 (클라이언트 토스트 즉시 표시)
- **1.5초 초과** → 즉시 `{ userComment }` 반환, Gemini 응답 오면 백그라운드에서 DB 저장
- **1.5초 내 응답** → `{ userComment, enjiComment }` 반환 (기존과 동일)

### Origin 제한 ✅
`/api/enji` 는 `Referer` 또는 `Origin` 헤더가 `NEXTAUTH_URL`(사이트 도메인)과 일치할 때만 처리.
불일치 시 403 반환.
