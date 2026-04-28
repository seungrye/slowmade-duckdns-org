# 완료 — 코드 품질 개선

### D1. 환경변수 중앙화 ✅
- `src/lib/env.ts` — `intEnv` 헬퍼, `env` 객체, `validateEnv()`
- 8개 파일의 분산된 `parseInt(process.env.X || '기본값')` 패턴 통합
- `src/lib/env.test.ts` — 8개 케이스

### D2. API 인증 헬퍼 추출 ✅
- `src/lib/require-auth.ts` — `requireAuth()` 헬퍼, `instanceof NextResponse`로 조기 반환
- 7개 API 라우트의 `auth()` + 401 패턴 교체
- `src/lib/require-auth.test.ts` — 4개 케이스

### D4. 업적 토스트 유틸 추출 ✅
- `src/lib/show-achievement-toast.tsx` — `showAchievementToasts()` 헬퍼
- `writer-form.section.tsx`, `comments.section.tsx` 각 14줄 → 1줄
- `src/lib/show-achievement-toast.test.tsx` — 5개 케이스 (fake timer 활용)

### D5. API 응답 형식 표준화 ✅
- `src/types/api.d.ts` — `ApiResponse<T>` discriminated union 타입 (`{ success: true, data, message? } | { success: false, message }`)
- `src/lib/api-response.ts` — `apiSuccess()`, `apiError()` 헬퍼 (TDD: 테스트 먼저 작성)
- `src/lib/api-response.test.ts` — 11개 케이스 (falsy data, data 키 부재 등)
- 12개 API 라우트 (`upload`, `submit`, `post`, `post/revision`, `post/revisions`, `posts`, `tags`, `like-dislike`, `comments`, `my-achievements`, `user/profile`, `user/settings`) 모두 표준화
- 12개 클라이언트 파일 응답 파싱 업데이트

### D6. 좋아요 상태 DB 조회로 전환 ✅
- `src/models/user.tsx` — `likedPosts: [String]` 필드 추가
- `GET /api/like-dislike?postId=X` 신규 — 로그인 사용자의 좋아요 여부 조회
- `POST /api/like-dislike` — 로그인 시 `$addToSet`/`$pull`로 `likedPosts` 동기화
- `like.section.tsx` — `useSession()` 연동, 로그인이면 DB, 비로그인이면 localStorage
- `src/app/api/like-dislike/route.test.ts` — 13개 케이스 (GET 6개, POST 7개)

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

### M1. bugfix + escapeRegex 공통 이동 ✅
- `src/lib/utils.ts` 신규 — `escapeRegex` 통합
- `!=` → `!==` (submit/route.tsx)
- `console.assert` → 명시적 에러/400 응답 (upload, post route)

### M1-remaining. posts aggregation $lookup 중복 제거 ✅
- `src/lib/posts.tsx` — `sort === 'commented'` 시 `$facet.data` 내 `$lookup` 제거 (pre-facet에서 이미 조인됨)
- `withComments` false일 때도 불필요한 `$lookup` 건너뜀
- `src/lib/posts.test.ts` — 6개 케이스 (파이프라인 구조 검증)

### T1. 테스트 커버리지 확대 ✅
- `src/lib/achievements.test.ts` — 업적 조건 16개 케이스 (postCount/commentCount/interaction)
- `src/app/api/submit/route.test.ts` — 7개 케이스 (신규 작성·수정·인증·검증)
- `src/app/api/post/route.test.ts` — 6개 케이스 (GET·DELETE)
- `src/app/api/posts/route.test.ts` — 5개 케이스 (파라미터 전달·정렬)
- `src/app/api/comments/route.test.ts` — 9개 케이스 (POST·GET·DELETE)
- 총 43개 케이스 추가 → 전체 187개 테스트

### B2. ESLint no-unused-vars 빌드 에러 수정 ✅
- 프로덕션 라우트 5개 — 미사용 `NextResponse` import 제거
- `like-dislike`, `submit` route — `catch (error)` → `catch`
- 테스트 파일 4개 — 미사용 `NextResponse` import 제거

### B1. Tiptap v3 StarterKit 중복 확장 경고 수정 ✅
- `viewer.tsx`, `editor.tsx` — `StarterKit.configure({ link: false, underline: false, trailingNode: false })`
- Tiptap v3에서 StarterKit이 link·underline·trailingNode를 기본 포함하도록 변경됨
- `src/components/rich-web-editor/viewer.test.ts` — 5개 케이스
