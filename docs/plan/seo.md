# SEO / AI 크롤링 (S 시리즈)

> 상세 분석: [docs/seo-ai-crawling.md](../seo-ai-crawling.md)

## 진행 중

## 대기

### S5 + S7. 시맨틱 HTML + JSON-LD Article 스키마
- `src/app/post/view/[[...id]]/post-view-container.tsx` — `<article>`, `<header>`, `<time>`, `<address>`
- `src/app/post/view/[[...id]]/page.tsx` — `<script type="application/ld+json">` 삽입
- page.tsx에서 `createdAt`, `author` 데이터를 PostViewContainer에 추가 전달 필요
- 두 작업 모두 같은 데이터 추가가 필요하므로 함께 처리

### S6. Open Graph / Twitter Card + Canonical URL
- `src/app/layout.tsx` — 사이트 전체 기본 OG 설정 (S4 완료 후 가능)
- `src/app/post/view/[[...id]]/page.tsx` — 게시글별 OG 태그 + `alternates.canonical`
- `og:type("article")`, `article:published_time`, `article:author`, `article:tag` 포함

### S8. `llms.txt` 추가
- `public/llms.txt` 생성
- AI 크롤러(ChatGPT, Perplexity 등) 전용 사이트 안내 파일

### S9. URL slug 기반으로 변경 (대형 작업)
- 현재: `/post/view/[ObjectID]` → 개선: `/post/[slug]`
- DB 스키마에 `slug` 필드 추가, 기존 게시물 마이그레이션 필요
- 301 리디렉션으로 기존 URL 유지
