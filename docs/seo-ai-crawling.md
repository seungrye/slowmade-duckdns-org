# SEO / AI 크롤링 최적화

AI 에이전트, 검색 엔진, 링크 프리뷰 도구가 콘텐츠를 정확히 이해할 수 있도록 구조를 개선한다.

---

## 현재 상태 분석

### 잘 된 것들

| 항목 | 파일 | 상태 |
|---|---|---|
| robots.txt | `src/app/robots.ts` | 전체 허용 + sitemap 경로 명시 |
| sitemap.xml | `src/app/sitemap.ts` | 동적 게시물 URL 자동 생성, lastmod/changefreq/priority 포함 |
| 동적 메타데이터 | `src/app/post/view/[[...id]]/page.tsx` | generateMetadata로 title/description/keywords 설정 |
| 정적 메타데이터 | `src/app/page.tsx` 등 | 주요 페이지 정적 메타데이터 설정 |

### 문제점

#### P1 — 즉시 수정 (코드 변경 없이 효과 큼)

**① description 품질이 나쁨**
- 파일: `src/app/post/view/[[...id]]/page.tsx`
- 현재: `Author: X, Title: 'Y', Likes: Z, Views: W, Created At: D`
  → AI/검색엔진이 콘텐츠를 이해하기 어려운 메타데이터 나열
- 개선: 본문 HTML 태그 제거 후 첫 160자 요약으로 교체

**② `lang="en"` — 한국어 사이트인데 영어 선언**
- 파일: `src/app/layout.tsx`
- AI/검색엔진 언어 감지 오류 및 한국어 타겟 지역 설정에 영향

**③ Sitemap에 크롤 불가 페이지 포함**
- 파일: `src/app/sitemap.ts`
- `/login`, `/dashboard/profile`, `/dashboard/posts` — 인증이 필요한 페이지
  → 크롤 예산(crawl budget) 낭비

**⑦ 시맨틱 HTML 태그 없음 (post-view-container)**
- 파일: `src/app/post/view/[[...id]]/post-view-container.tsx`
- 전체가 `<div>` 구조 — AI/검색엔진이 게시글 영역, 제목, 작성일을 구조적으로 파악 불가
- 개선: `<article>`, `<header>`, `<time datetime="...">`, `<address>` 태그 적용
- 단, `'use client'` 컴포넌트이므로 `createdAt`, `author` 데이터를 page.tsx에서 추가 전달 필요

**⑧ Canonical URL 없음**
- 파일: `src/app/post/view/[[...id]]/page.tsx`
- `generateMetadata`에 `alternates.canonical` 미설정
- 동일 콘텐츠가 다른 경로로 접근될 때 중복 콘텐츠 문제 발생 가능
- S5 Open Graph 작업 시 함께 추가

#### P2 — 중요 개선 (AI 이해도를 크게 높임)

**④ Open Graph / Twitter Card 메타태그 없음**
- AI 에이전트, SNS 링크 프리뷰, 검색 결과 미리보기가 og 태그를 우선 읽음
- 필요: `og:title`, `og:description`, `og:type("article")`, `og:url`,
  `og:image`, `article:published_time`, `article:author`, `article:tag`

**⑤ JSON-LD Article 구조화 데이터 없음**
- Google/Bing/AI 검색엔진이 가장 신뢰하는 형식
- Article 스키마가 없으면 글의 저자/날짜/본문을 구조적으로 파악 불가
- 파일: `src/app/post/view/[[...id]]/page.tsx` 또는 post-view-container.tsx에 `<script type="application/ld+json">` 추가

**⑥ 루트 `layout.tsx`가 `'use client'`**
- 사이트 전체 기본 OG 이미지, canonical URL, Twitter 메타태그 등을
  루트 layout에서 설정 불가
- `DarkClassSync` 컴포넌트만 분리하면 해결됨

#### P3 — 선택적 개선

**⑦ `llms.txt` 추가**
- AI 크롤러(ChatGPT, Perplexity 등)를 위한 새로운 표준 파일
- `public/llms.txt`에 사이트 목적, 주요 콘텐츠 경로, 크롤 허용 범위 명시

**⑧ URL slug 기반으로 변경**
- 현재: `/post/view/69f01abca429772f289cc030` (MongoDB ObjectID)
- 개선: `/post/추천-디렉토리-구조` (한글 slug)
- AI가 URL만 보고 콘텐츠를 예측 가능
- DB 스키마 변경 필요 — 가장 큰 작업

---

## 개선 체크리스트

- [ ] P1-① description을 본문 요약으로 교체
- [ ] P1-② `lang="ko"` 수정
- [ ] P1-③ Sitemap에서 인증 페이지 제거
- [ ] P1-⑦ 시맨틱 HTML 태그 적용 (`<article>`, `<time>`, `<address>`)
- [ ] P2-⑥ 루트 layout `'use client'` 분리
- [ ] P2-④ Open Graph / Twitter Card + Canonical URL 메타태그 추가
- [ ] P2-⑤ JSON-LD Article 스키마 추가
- [ ] P3-⑧ `llms.txt` 추가
- [ ] P3-⑨ URL slug 기반으로 변경

---

## 참고

- [Open Graph Protocol](https://ogp.me/)
- [Google JSON-LD Article](https://developers.google.com/search/docs/appearance/structured-data/article)
- [llms.txt 표준](https://llmstxt.org/)
- [Next.js Metadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)
