# 완료 — SEO / AI 크롤링

### S1. description 본문 요약 교체 ✅
- `src/app/post/view/[[...id]]/page.tsx` — htmlContent 태그 제거 후 160자 요약

### S2. `lang="ko"` 수정 ✅
- `src/app/layout.tsx` — `<html lang="ko">`

### S3. Sitemap 인증 페이지 제거 ✅
- `src/app/sitemap.ts` — `/login`, `/dashboard/*` 제거

### S4. 루트 layout `'use client'` 분리 ✅
- `src/components/dark-class-sync.tsx` — DarkClassSync 클라이언트 컴포넌트
- `src/components/providers.tsx` — SessionProvider 래퍼 클라이언트 컴포넌트
- `src/app/layout.tsx` — 서버 컴포넌트 전환, 전역 `metadata` 추가
- `src/components/dark-class-sync.test.tsx` — jsdom 환경 테스트 (마운트·이벤트·언마운트)
- `vitest.config.ts` — `@vitejs/plugin-react` 추가, jsdom 지원

### S5 + S7. 시맨틱 HTML + JSON-LD Article 스키마 ✅
- `post-view-container.tsx` — `<article>`, `<header>`, `<time>`, `<address>` 적용
- `article-json-ld.ts` — `buildArticleJsonLd` 헬퍼 추출
- `page.tsx` — JSON-LD `<script>` 삽입, `createdAt`/`author` 전달
- `article-json-ld.test.ts` — 7개 케이스

### S6. Open Graph / Twitter Card + Canonical URL ✅
- `layout.tsx` — `metadataBase(NEXTAUTH_URL)`, 전역 OG/Twitter 기본값
- `build-post-metadata.ts` — 게시글 메타데이터 헬퍼 (테스트용 분리)
- `page.tsx` — `generateMetadata`에 OG article + canonical 적용
- `build-post-metadata.test.ts` — 8개 케이스

### S8. `llms.txt` 추가 ✅
- `public/llms.txt` — 사이트 목적, 콘텐츠 구조, 크롤 안내
