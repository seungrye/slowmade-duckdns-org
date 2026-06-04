# 현재 enji-bot 구조

## 개요

`@enji-bot` 멘션을 포함한 댓글이 제출되면 AI 가 컨텍스트(게시글 + 최근 댓글)를 참고해 답글 댓글을 자동 생성한다. 채팅 전용, 텍스트만, 이미지 출력 없음.

## API Endpoint

- **경로**: `POST /api/enji`
- **파일**: [`webapp/src/app/api/enji/route.ts`](../../../webapp/src/app/api/enji/route.ts)
- **인증**: NextAuth 세션 필요 (`session.user`) — 미로그인 401
- **Origin 검사**: `siteUrl` referer/origin 화이트리스트
- **요청 body**: `{ postId, parentId?, content, anonid? }`
- **응답**:
  - 즉시: `{ success: true, data: { userComment } }` (201)
  - 백그라운드: Gemini 호출 후 별도 enji 댓글을 DB 에 저장 (`isEnji: true`, `author: 'enji-bot'`, `parentId`)
  - 클라이언트는 `/api/comments` 를 폴링하여 enji 댓글이 등장하면 표시 (`useComments` 훅, 2초 간격, 30초 데드라인)

## SDK / 모델

- **SDK**: `@google/genai` `^2.5.0`
- **인증 키**: `process.env.GEMINI_API_KEY` (env: `env.geminiApiKey`)
- **모델 fallback chain** (현재 채팅용):
  ```
  gemini-2.5-flash
  gemini-2.5-flash-lite
  gemini-flash-lite-latest
  gemini-flash-latest
  ```
- **시스템 프롬프트**: "당신은 'enji-bot' 입니다. 유머 콘텐츠 사이트의 AI 비서…" (한국어, 3~5문장 한정)

## 컨텍스트 구성

`callGemini(contextMessage)` 의 입력:

```
[게시글 제목]: ...
[게시글 내용]: stripHtml(post.htmlContent).slice(0, 3000)
[최근 댓글]:
{author}: {content} × 최근 20개 (오래된 순)

[사용자 질문]: content.replace(/@enji-bot/gi, '').trim() || '안녕하세요!'
```

## 프론트엔드 UI

- **입력**: [`comment-input.tsx`](../../../webapp/src/components/comment-input.tsx) — `@` 입력 시 멘션 목록(`enji-bot`, 로그인 시) 자동완성
- **트리거**: [`use-comments.ts`](../../../webapp/src/hooks/use-comments.ts) — `parentIsEnji === true || /@enji-bot/i.test(content)` → `/api/enji`
- **표시**: [`comment-item.tsx`](../../../webapp/src/components/comment-item.tsx) — `c.isEnji` 인 댓글은 보라색 보더 + ✨ 아이콘
- **이어가기**: enji 댓글에 Reply 버튼 → `parentIsEnji=true` 로 다시 `/api/enji` 호출

## 데이터 모델

- **Comment** (`webapp/src/models/comment.ts`):
  - `isEnji: boolean` — enji 가 작성한 댓글 표시
  - `author: 'enji-bot'`
  - `authorId: null`
  - `parent: <사용자 댓글 _id>`
- **이미지 첨부 없음** — 현재 Comment 스키마에 `imageUrl`/`attachments` 필드 없음

## 환경변수

- 필수: `MONGO_URI`, `MINIO_*`, `NEXTAUTH_URL`
- enji 전용: `GEMINI_API_KEY` (없으면 `/api/enji` 가 503 반환)

## 제약

- 응답은 비동기(폴링) — 즉시 응답 모델 아님
- 모델 fallback 으로 503/429 일시 장애 대비
- Gemini API 쿼터 보호용 로그인 사용자 한정

## 이미지 통합 시 영향 범위

이미지 기능 추가 시 손대야 할 곳:

1. `webapp/src/app/api/enji/route.ts` — 이미지 분기 + image SDK 호출 + 저장
2. **Comment 스키마** — `imageUrl?: string` 또는 `attachments?: string[]` 추가
3. `comment-item.tsx` — 이미지 렌더링 분기
4. `comment-input.tsx` — `/image` 명령어/버튼 UI (옵션)
5. **이미지 저장소** — MinIO 가 이미 있음 → enji 이미지 버킷 재사용 가능
6. `webapp/src/lib/env.ts` — 신규 환경변수 (`ENJI_IMAGE_MODEL`, `ENJI_IMAGE_DAILY_LIMIT` 등) 필요 시
