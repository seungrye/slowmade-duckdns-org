# Plan

## 완료 항목

### 1. 태그 클라우드 검색 ✅
- `src/app/tags/tag-cloud-search.tsx`에서 클라이언트 측 필터링
- 검색 결과 없을 때 안내 메시지 표시
- 테스트: `src/app/tags/tag-cloud-search.helpers.ts`, `src/app/tags/tag-cloud-search.test.ts`
- 버그 수정: 긴 태그명으로 인한 모바일 수평 스크롤 (`break-all` 적용)

### 9. 카드 본문 토글 미리보기 ✅
- 메인 페이지 및 태그 검색 결과 페이지: 카드 토글 시 본문 일부 표시
- `max-h-64 overflow-hidden` + 하단 gradient fade + "전체 보기" 링크
- `src/app/tags/[tag]/tag-post-list.tsx` — 태그 결과용 클라이언트 토글 컴포넌트 신설
- `getPostsByTag` `$project`에서 `jsonContent` 제외 항목 삭제

### 10. 다크 모드 ✅
- 시스템 테마(`@media (prefers-color-scheme: dark)`) 기반
- `layout.tsx` `DarkClassSync` 컴포넌트: 미디어 쿼리 변화 감지 → `<html class="dark">` 동기화 (TipTap 자체 디자인 시스템 대응)
- `globals.css`: `[data-theme="dark/light"]` 변수, `:root:not([data-theme="light"])` 미디어 쿼리 조건 추가
- UI 컴포넌트(Button/Badge/Card/Input), 공통 컴포넌트, 전체 페이지에 `dark:` 클래스 적용

### 11. 내가 올린 유머 본문 프리뷰 ✅
- `src/components/post-content-preview.tsx` — `RichContentViewer` 래퍼 (ssr: false, 로딩 스켈레톤 포함)
- `dashboard/posts/page.tsx`: 썸네일 없을 때 기존 iframe → `PostContentPreview`로 교체

### 8. 디자인 시스템 기초 ✅
- `src/lib/cn.ts` — clsx + tailwind-merge 기반 클래스 병합 유틸리티
- `src/components/ui/` — Button, Card, Input, Badge 프리미티브 컴포넌트
  - variant/size props로 일관된 스타일 표현
  - `.variants.ts`로 순수 설정 분리 → 단위 테스트 가능
- `globals.css @theme` — brand 색상 토큰, shadow-card 추가
- 적용: input-search, modal, my-profile, post view 태그

---

## 코드 품질 개선 항목

> 상세 분석: [docs/code-quality.md](code-quality.md)

### D1. 환경변수 중앙화
- `src/lib/env.ts` 신규 생성
- `achievements.tsx`, `post-actions.tsx`, API 라우트 5개에 분산된 `parseInt(process.env.X || '기본값')` 패턴 통합
- 시작 시 필수 환경변수 일괄 검증 (`MONGO_URI`, `MINIO_*` 등)

### D2. API 인증 헬퍼 추출
- `src/lib/require-auth.ts` 신규 생성
- 6개 API 라우트에서 반복되는 `auth()` + 401 응답 패턴 추출
- 사용: `const email = await requireAuth(request)` 한 줄로 대체

### D3. fetch 클라이언트 라이브러리
- `src/lib/api-client.ts` 신규 생성
- 15개 이상 컴포넌트에 산재한 `fetch + 에러처리` 패턴 통합
- `apiGet<T>`, `apiPost<T>`, `apiDelete<T>` 제공

### D4. 업적 토스트 유틸 추출
- `src/lib/show-achievement-toast.ts` 신규 생성
- `writer-form.section.tsx`, `comments.section.tsx` 공통 패턴 추출

### D5. API 응답 형식 표준화
- `src/types/api.d.ts`에 `ApiResponse<T>` 타입 정의
- 모든 API 라우트의 성공/에러 응답 구조 통일 (`success`, `data`, `message`)
- HTTP 상태 코드 상수 통일 (현재 `axios.HttpStatusCode` vs 숫자 리터럴 혼용)

### D6. 좋아요 상태 DB 조회로 전환
- `src/app/post/view/[[...id]]/like.section.tsx`
- `localStorage`만으로 좋아요 여부 판단 → 로그인 사용자는 DB 조회
- 다른 기기/브라우저에서 상태 소실 문제 해결

### D7. `comments.section.tsx` 분리
- `src/hooks/use-comments.ts` — 댓글 CRUD 로직 훅으로 추출
- `src/components/comment-item.tsx` — 단일 댓글 렌더링 컴포넌트
- `src/components/comment-input.tsx` — 입력 영역 컴포넌트

### M1. 기타 유지보수
- `src/lib/utils.ts`에 `escapeRegex` 공통 이동 (현재 2곳 중복 정의)
- `src/app/api/post/route.tsx` 24줄 `!=` → `!==`
- `src/app/api/upload/route.tsx` `console.assert` → throw 방식으로 교체
- `src/lib/posts.tsx` — `'commented'` 정렬 시 `$lookup` 중복 제거

### T1. 테스트 커버리지 확대
- `src/lib/achievements.tsx` — 업적 조건 단위 테스트
- `src/app/api/*/route.tsx` — 주요 API 라우트 테스트 (인증, 권한, 에러 케이스)

---

## SEO / AI 크롤링 최적화 항목

> 상세 분석: [docs/seo-ai-crawling.md](seo-ai-crawling.md)

### S1. description 본문 요약으로 교체
- `src/app/post/view/[[...id]]/page.tsx`
- HTML 태그 제거 후 본문 첫 160자로 description 교체
- 현재: 메타데이터 나열 → 개선: 읽을 수 있는 요약문

### S2. `lang="ko"` 수정
- `src/app/layout.tsx`
- `<html lang="en">` → `<html lang="ko">`

### S3. Sitemap에서 인증 페이지 제거
- `src/app/sitemap.ts`
- `/login`, `/dashboard/profile`, `/dashboard/posts` 제거

### S4. 루트 layout `'use client'` 분리
- `src/app/layout.tsx`
- `DarkClassSync` 컴포넌트를 별도 파일로 분리
- 루트 layout을 서버 컴포넌트로 전환 → 전역 metadata 설정 가능

### S5. 시맨틱 HTML 태그 적용
- `src/app/post/view/[[...id]]/post-view-container.tsx`
- `<div>` → `<article>`, `<header>`, `<time datetime="...">`, `<address>` 교체
- page.tsx에서 `createdAt`, `author` 데이터를 PostViewContainer에 추가 전달 필요

### S6. Open Graph / Twitter Card + Canonical URL 추가
- `src/app/layout.tsx` — 사이트 전체 기본 OG 설정 (S4 완료 후 가능)
- `src/app/post/view/[[...id]]/page.tsx` — 게시글별 OG 태그 + `alternates.canonical`
- `og:type("article")`, `article:published_time`, `article:author`, `article:tag` 포함

### S7. JSON-LD Article 스키마 추가
- `src/app/post/view/[[...id]]/page.tsx`에 `<script type="application/ld+json">` 삽입
- author, datePublished, headline, keywords 포함

### S8. `llms.txt` 추가
- `public/llms.txt` 생성
- AI 크롤러(ChatGPT, Perplexity 등) 전용 사이트 안내 파일

### S9. URL slug 기반으로 변경
- 현재: `/post/view/[ObjectID]` → 개선: `/post/[slug]`
- DB 스키마에 `slug` 필드 추가, 기존 게시물 마이그레이션 필요
- 301 리디렉션으로 기존 URL 유지

---

## 미완료 항목

### 2. 작성 페이지 임시 저장
- 구현 위치: `src/app/post/write/[[...id]]/writer-form.section.tsx`
- 저장 대상: 제목, 태그, 에디터 내용 (`htmlContent`, `jsonContent`), 이미지 URL 배열
- 저장 방식: `localStorage` 사용, draft key: `postDraft-new` / `postDraft-<postId>`
- 트리거: `beforeunload` 이벤트 및 언마운트 시
- 복구: 페이지 로드 시 draft 확인 후 사용자 안내 메시지 표시
- 제출 후 처리: 저장 성공 시 draft 삭제

### 3. 작성글 revision UI
- 백엔드: `GET /api/post/revisions?postId=` 이미 구현됨
- 단일 revision 조회 API (`GET /api/post/revision?revisionId=`) 추가 필요
- 프론트엔드에 revision 목록 패널 추가
  - 버전별 `version`, 작성일, 제목 표시
  - 두 버전 선택 후 단어 단위 diff 비교 (GitHub wiki 스타일)
  - 선택한 버전을 에디터에 복원하는 기능

### 4. 작성/보기 화면 전체 높이 채우기
- `src/app/post/write/[[...id]]/writer-form.section.tsx`
- `src/app/post/view/[[...id]]/page.tsx`
- 현재 `min-h-[480px]` → flex 레이아웃으로 화면 나머지 영역을 채우도록 변경
- `layout.tsx` body/main에 flex 구조 추가 필요
- 주의: `flex` 컨텍스트에서 페이지 래퍼의 `mx-auto`가 마진으로 동작하는 버그 고려

### 5. 태그 검색된 자료 바로보기
- `src/app/tags/[tag]/page.tsx`
- 결과 리스트 항목 전체를 클릭 가능하도록 변경
- 제목 빈 곳 클릭 시 상세 페이지 이동

### 6. 작성글 바로보기 클릭 영역 확장
- `src/components/post-item.tsx`
- 하단 메타 영역(댓글 수, 좋아요 수) 빈 공간 클릭 시 상세 페이지 이동
- 카드 전체를 클릭 가능하게 구성

### 7. 작성순 / 갱신순 정렬 추가
- `src/lib/sort.tsx`에 `updated` 옵션 추가
- `src/lib/posts.tsx`에서 `updatedAt` 정렬 지원
- 메인/대시보드 정렬 UI에 `작성순`, `갱신순` 추가
- `src/app/api/user/settings/route.tsx`에 기본 정렬 설정 추가

---

## 우선순위 제안

### 코드 품질 (D/M/T 시리즈)
1. M1-bugfix — `!=` → `!==`, `console.assert` → throw (15분)
2. M1-util — `escapeRegex` 공통 이동 (10분)
3. D1 — 환경변수 중앙화 (1시간)
4. D2 — API 인증 헬퍼 추출 (30분)
5. D4 — 업적 토스트 유틸 추출 (20분)
6. D5 — API 응답 형식 표준화 (1~2시간)
7. D3 — fetch 클라이언트 라이브러리 (1시간)
8. D6 — 좋아요 상태 DB 조회 (1시간)
9. D7 — comments.section 분리 (2시간)
10. T1 — 테스트 커버리지 확대 (지속)

### SEO / AI 크롤링 (S 시리즈)
1. S2 — `lang="ko"` 수정 (1분)
2. S3 — Sitemap 인증 페이지 제거 (5분)
3. S1 — description 본문 요약 교체 (15분)
4. S4 — 루트 layout `'use client'` 분리 (30분)
5. S5 — 시맨틱 HTML 태그 적용 (30분)
6. S6 — Open Graph + Canonical URL (30분)
7. S7 — JSON-LD Article 스키마 (30분)
8. S8 — llms.txt 추가 (15분)
9. S9 — URL slug 변경 (대형 작업)

### 기존 기능
1. 작성 페이지 임시 저장 (#2)
2. 작성/보기 화면 전체 높이 (#4)
3. 작성글 revision UI (#3)
4. 작성글 바로보기 클릭 영역 확장 (#6)
5. 작성순/갱신순 정렬 (#7)
6. 태그 검색된 자료 바로보기 (#5)
