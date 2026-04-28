# SEO / AI 크롤링 (S 시리즈)

> 상세 분석: [docs/seo-ai-crawling.md](../seo-ai-crawling.md)

## 진행 중

## 대기

### S8. `llms.txt` 추가
- `public/llms.txt` 생성
- AI 크롤러(ChatGPT, Perplexity 등) 전용 사이트 안내 파일

### S9. URL slug 기반으로 변경 (대형 작업)
- 현재: `/post/view/[ObjectID]` → 개선: `/post/[slug]`
- DB 스키마에 `slug` 필드 추가, 기존 게시물 마이그레이션 필요
- 301 리디렉션으로 기존 URL 유지
