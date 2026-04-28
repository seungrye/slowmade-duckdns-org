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

### S6. Open Graph / Twitter Card + Canonical URL ✅
- `layout.tsx` — `metadataBase(NEXT_PUBLIC_SITE_URL)`, 전역 OG/Twitter 기본값
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
