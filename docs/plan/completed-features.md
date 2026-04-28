# 완료 — 기능 개발

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
