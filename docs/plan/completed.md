# 완료 항목

### 1. 태그 클라우드 검색 ✅
- `src/app/tags/tag-cloud-search.tsx`에서 클라이언트 측 필터링
- 검색 결과 없을 때 안내 메시지 표시
- 테스트: `src/app/tags/tag-cloud-search.helpers.ts`, `src/app/tags/tag-cloud-search.test.ts`
- 버그 수정: 긴 태그명으로 인한 모바일 수평 스크롤 (`break-all` 적용)

### 8. 디자인 시스템 기초 ✅
- `src/lib/cn.ts` — clsx + tailwind-merge 기반 클래스 병합 유틸리티
- `src/components/ui/` — Button, Card, Input, Badge 프리미티브 컴포넌트
- `globals.css @theme` — brand 색상 토큰, shadow-card 추가

### 9. 카드 본문 토글 미리보기 ✅
- 메인 페이지 및 태그 검색 결과 페이지: 카드 토글 시 본문 일부 표시
- `src/app/tags/[tag]/tag-post-list.tsx` — 태그 결과용 클라이언트 토글 컴포넌트 신설

### 10. 다크 모드 ✅
- 시스템 테마(`@media (prefers-color-scheme: dark)`) 기반
- `layout.tsx` `DarkClassSync` 컴포넌트: 미디어 쿼리 변화 감지 → `<html class="dark">` 동기화

### 11. 내가 올린 유머 본문 프리뷰 ✅
- `src/components/post-content-preview.tsx` — `RichContentViewer` 래퍼

### S1. description 본문 요약 교체 ✅
- `src/app/post/view/[[...id]]/page.tsx` — htmlContent 태그 제거 후 160자 요약

### S2. `lang="ko"` 수정 ✅
- `src/app/layout.tsx` — `<html lang="ko">`

### D7. `comments.section.tsx` 분리 ✅
- `src/types/comment.d.ts` — `Comment` 타입 추출
- `src/hooks/use-comments.ts` — fetch/submit/delete CRUD 로직 + 상태 관리
- `src/components/comment-item.tsx` — 댓글 단건 렌더링 (삭제됨/정상, 답글 폼 포함)
- `src/components/comment-input.tsx` — textarea + 버튼 폼 (controlled, onSubmit 콜백)
- `comments.section.tsx` — 311줄 → 100줄 오케스트레이터로 축소
- `src/hooks/use-comments.test.ts` — 10개 케이스
- `src/components/comment-item.test.tsx` — 10개 케이스
- `src/components/comment-input.test.tsx` — 7개 케이스
- `@testing-library/jest-dom` 설치, `src/test-setup.ts` 추가

### D6. 좋아요 상태 DB 조회로 전환 ✅
- `src/models/user.tsx` — `likedPosts: [String]` 필드 추가
- `GET /api/like-dislike?postId=X` 신규 — 로그인 사용자의 좋아요 여부 조회
- `POST /api/like-dislike` — 로그인 시 `$addToSet`/`$pull`로 `likedPosts` 동기화
- `like.section.tsx` — `useSession()` 연동, 로그인이면 DB, 비로그인이면 localStorage
- `src/app/api/like-dislike/route.test.ts` — 13개 케이스 (GET 6개, POST 7개)

### D5. API 응답 형식 표준화 ✅
- `src/types/api.d.ts` — `ApiResponse<T>` discriminated union 타입 (`{ success: true, data, message? } | { success: false, message }`)
- `src/lib/api-response.ts` — `apiSuccess()`, `apiError()` 헬퍼 (TDD: 테스트 먼저 작성)
- `src/lib/api-response.test.ts` — 11개 케이스 (falsy data, data 키 부재 등)
- 12개 API 라우트 (`upload`, `submit`, `post`, `post/revision`, `post/revisions`, `posts`, `tags`, `like-dislike`, `comments`, `my-achievements`, `user/profile`, `user/settings`) 모두 표준화
- 12개 클라이언트 파일 (`infinite-post.section`, `like.section`, `writer-form.section`, `tag-input.section`, `revision-history.section`, `settings/page`, `my-achievements.section`, `my-profile.section`, `comments.section`, `my-humor-list`, 기존 `upload` 테스트 포함) 응답 파싱 업데이트

### D4. 업적 토스트 유틸 추출 ✅
- `src/lib/show-achievement-toast.tsx` — `showAchievementToasts()` 헬퍼
- `writer-form.section.tsx`, `comments.section.tsx` 각 14줄 → 1줄
- `src/lib/show-achievement-toast.test.tsx` — 5개 케이스 (fake timer 활용)

### D2. API 인증 헬퍼 추출 ✅
- `src/lib/require-auth.ts` — `requireAuth()` 헬퍼, `instanceof NextResponse`로 조기 반환
- 7개 API 라우트의 `auth()` + 401 패턴 교체
- `src/lib/require-auth.test.ts` — 4개 케이스

### D1. 환경변수 중앙화 ✅
- `src/lib/env.ts` — `intEnv` 헬퍼, `env` 객체, `validateEnv()`
- 8개 파일의 분산된 `parseInt(process.env.X || '기본값')` 패턴 통합
- `src/lib/env.test.ts` — 8개 케이스

### S8. `llms.txt` 추가 ✅
- `public/llms.txt` — 사이트 목적, 콘텐츠 구조, 크롤 안내

### S6. Open Graph / Twitter Card + Canonical URL ✅
- `layout.tsx` — `metadataBase(NEXTAUTH_URL)`, 전역 OG/Twitter 기본값
- `build-post-metadata.ts` — 게시글 메타데이터 헬퍼 (테스트용 분리)
- `page.tsx` — `generateMetadata`에 OG article + canonical 적용
- `build-post-metadata.test.ts` — 8개 케이스

### S5 + S7. 시맨틱 HTML + JSON-LD Article 스키마 ✅
- `post-view-container.tsx` — `<article>`, `<header>`, `<time>`, `<address>` 적용
- `article-json-ld.ts` — `buildArticleJsonLd` 헬퍼 추출
- `page.tsx` — JSON-LD `<script>` 삽입, `createdAt`/`author` 전달
- `article-json-ld.test.ts` — 7개 케이스

### S4. 루트 layout `'use client'` 분리 ✅
- `src/components/dark-class-sync.tsx` — DarkClassSync 클라이언트 컴포넌트
- `src/components/providers.tsx` — SessionProvider 래퍼 클라이언트 컴포넌트
- `src/app/layout.tsx` — 서버 컴포넌트 전환, 전역 `metadata` 추가
- `src/components/dark-class-sync.test.tsx` — jsdom 환경 테스트 (마운트·이벤트·언마운트)
- `vitest.config.ts` — `@vitejs/plugin-react` 추가, jsdom 지원

### S3. Sitemap 인증 페이지 제거 ✅
- `src/app/sitemap.ts` — `/login`, `/dashboard/*` 제거

### M1. bugfix + escapeRegex 공통 이동 ✅
- `src/lib/utils.ts` 신규 — `escapeRegex` 통합
- `!=` → `!==` (submit/route.tsx)
- `console.assert` → 명시적 에러/400 응답 (upload, post route)
