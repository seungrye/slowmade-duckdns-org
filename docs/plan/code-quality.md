# 코드 품질 개선 (D/M/T 시리즈)

> 상세 분석: [docs/code-quality.md](../code-quality.md)

## 진행 중

## 대기

### D3. fetch 클라이언트 라이브러리
- `src/lib/api-client.ts` 신규 생성
- 15개 이상 컴포넌트에 산재한 `fetch + 에러처리` 패턴 통합
- D5 완료 후 진행 (응답 타입 기준으로 작성)

### D6. 좋아요 상태 DB 조회로 전환
- `src/app/post/view/[[...id]]/like.section.tsx`
- `localStorage`만으로 좋아요 여부 판단 → 로그인 사용자는 DB 조회

### D7. `comments.section.tsx` 분리
- `src/hooks/use-comments.ts` — 댓글 CRUD 로직 훅으로 추출
- `src/components/comment-item.tsx` — 단일 댓글 렌더링 컴포넌트
- `src/components/comment-input.tsx` — 입력 영역 컴포넌트
- D3 완료 후 진행

### M1-remaining. posts aggregation $lookup 중복 제거
- `src/lib/posts.tsx` — `'commented'` 정렬 시 `$lookup` 중복 제거

### T1. 테스트 커버리지 확대
- `src/lib/achievements.tsx` — 업적 조건 단위 테스트
- `src/app/api/*/route.tsx` — 주요 API 라우트 테스트
- 리팩토링 이후 작성이 의미 있음
