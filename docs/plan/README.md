# 진행 순서

| # | 항목 | 비고 |
|---|---|---|
| 1 | ✅ S2 + S3 — `lang="ko"` + Sitemap 정리 | 독립, 한 커밋 |
| 2 | ✅ S1 — description 본문 요약 교체 | 독립 |
| 3 | ✅ M1 — bugfix + escapeRegex 이동 | 빠른 정리 |
| 4 | ✅ S4 — 루트 layout `'use client'` 분리 | S6 전제조건이자 코드 품질 개선 |
| 5 | ✅ S5 + S7 — 시맨틱 HTML + JSON-LD | 같은 데이터(createdAt, author) 추가 작업 공유 |
| 6 | ✅ S6 — Open Graph + Canonical URL | S4 완료 후 가능 |
| 7 | ✅ S8 — llms.txt 추가 | 독립 |
| 8 | D1 — 환경변수 중앙화 | 이후 D 시리즈의 기반 |
| 9 | D2 — API 인증 헬퍼 추출 | D1 이후 |
| 10 | D4 — 업적 토스트 유틸 추출 | 작고 독립 |
| 11 | D5 — API 응답 형식 표준화 | D3 전에 타입 먼저 정의 |
| 12 | D3 — fetch 클라이언트 라이브러리 | D5 응답 타입 기준으로 작성 |
| 13 | D6 — 좋아요 상태 DB 조회 | 독립 기능 수정 |
| 14 | D7 — comments.section 분리 | D3 있으면 훅 추출이 깔끔함 |
| 15 | T1 — 테스트 커버리지 확대 | 리팩토링 이후 작성이 의미 있음 |
| 16 | #2 — 작성 페이지 임시 저장 | |
| 17 | #4 — 작성/보기 화면 전체 높이 | |
| 18 | #3 — 작성글 revision UI | |
| 19 | #6 — 작성글 바로보기 클릭 영역 확장 | |
| 20 | #7 — 작성순/갱신순 정렬 | |
| 21 | #5 — 태그 검색된 자료 바로보기 | |
| 22 | S9 — URL slug 변경 | 대형 작업, 마지막 |

## 파일 구조

- [completed.md](completed.md) — 완료 항목
- [seo.md](seo.md) — SEO / AI 크롤링 (S 시리즈)
- [code-quality.md](code-quality.md) — 코드 품질 개선 (D/M/T 시리즈)
- [features.md](features.md) — 기존 기능 개발 (#2~#7)
