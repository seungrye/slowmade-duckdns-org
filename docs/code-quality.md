# 코드 품질 개선 (재사용 · 설계 · 유지보수)

---

## 현황 요약

| 분류 | 심각도 | 항목 수 |
|---|---|---|
| 중복 코드 | High | 4개 |
| 설계 문제 | High | 3개 |
| 유지보수 | Medium | 4개 |
| 테스트 | Medium | 1개 |

---

## 중복 코드 (Duplication)

### D1. 환경변수 파싱 분산

여러 파일에서 동일한 `parseInt(process.env.X || '기본값', 10)` 패턴 반복:

| 파일 | 환경변수 |
|---|---|
| `src/lib/achievements.tsx` | `ACHIEVEMENT_*_POINTS` 18개 이상 |
| `src/components/post-actions.tsx` | `NEXT_PUBLIC_DELETE_POST_COST` |
| `src/app/api/post/route.tsx` | `DELETE_POST_COST` |
| `src/app/api/comments/route.tsx` | `POINTS_FOR_NEW_COMMENT` |
| `src/app/api/submit/route.tsx` | `POINTS_FOR_NEW_POST` |

- 서버/클라이언트에서 같은 값을 다른 이름으로 참조 (`DELETE_POST_COST` vs `NEXT_PUBLIC_DELETE_POST_COST`)
- 기본값이 파일마다 다를 경우 불일치 버그 발생 가능

**개선**: `src/lib/env.ts` 하나에 모든 환경변수 파싱/검증 집중

### D2. API 인증 체크 반복

6개 API 라우트에서 동일 코드:
```ts
const session = await auth();
if (!session?.user?.email) {
  return NextResponse.json({ message: '인증이 필요합니다.' }, { status: 401 });
}
```

파일: `api/post`, `api/submit`, `api/comments`, `api/like-dislike`, `api/user/profile`, `api/user/settings`

**개선**: `src/lib/require-auth.ts` 헬퍼로 추출

### D3. fetch 호출 패턴 분산

15개 이상의 컴포넌트에서 fetch + 에러 처리 + toast 패턴 반복  
(`writer-form.section.tsx`, `comments.section.tsx`, `like.section.tsx`, `my-profile.section.tsx`, `settings/page.tsx`, `infinite-post.section.tsx` 등)

**개선**: `src/lib/api-client.ts` 생성 — `apiGet<T>`, `apiPost<T>`, `apiDelete<T>`

### D4. 업적 토스트 알림 패턴 반복

`writer-form.section.tsx`와 `comments.section.tsx`에서 동일한 achievement toast 렌더링 코드:
```ts
result.unlockedAchievements?.forEach((achievement, index) => {
  setTimeout(() => toast.custom(...), index * 500);
});
if (result.pointsGained > 0) toast(`✨ ${result.pointsGained} 포인트 획득`);
```

**개선**: `src/lib/show-achievement-toast.ts` 유틸 함수로 추출

---

## 설계 문제 (Design)

### D5. API 응답 형식 불일치

라우트마다 응답 구조가 다름:

```ts
// 타입 A
return NextResponse.json({ message: "...", likes: updatedPost.likes });

// 타입 B
return NextResponse.json(posts);  // message 없음

// 타입 C
return NextResponse.json({ error: validation.error }, { status: 400 });
```

에러 키도 `message` / `error` 혼용. HTTP 상태 코드 라이브러리도 `axios.HttpStatusCode` vs 숫자 리터럴 혼용.

**개선**: `ApiResponse<T>` 표준 타입 정의 + 모든 라우트에 적용

### D6. 좋아요 상태가 localStorage에만 보관

- 파일: `src/app/post/view/[[...id]]/like.section.tsx`
- `localStorage.getItem('liked_${_id}')` 로 좋아요 여부 판단
- DB의 실제 상태와 불일치 가능, hydration mismatch 위험
- 다른 기기/브라우저에서 좋아요 상태 소실

**개선**: 로그인 사용자는 DB에서 좋아요 여부 조회

### D7. `comments.section.tsx` 단일 파일에 과다 책임

327줄, 상태 6개 — 댓글 목록 조회 / 작성 / 수정 / 삭제 / 대댓글 / 토스트 표시 모두 담당  
재사용 불가, 테스트 불가 구조.

**개선**: `useComments` 훅 + `CommentItem` / `CommentInput` 컴포넌트 분리

---

## 유지보수 문제 (Maintainability)

### M1. MongoDB aggregation pipeline 중복 $lookup

- 파일: `src/lib/posts.tsx`
- `'commented'` 정렬 시 `$lookup: comments` 가 2번 실행됨 (39~55줄, 72~75줄)

**개선**: 첫 번째 stage에서 조인 후 재사용

### M2. `console.assert`로 환경변수 검증 ✅

- `src/app/api/upload/route.tsx` — `if (!process.env.X) throw new Error(...)` 로 교체
- `src/app/api/post/route.tsx` — `console.assert` → 400 응답으로 교체

### M3. `!=` 대신 `!==` 사용 ✅

- `src/app/api/submit/route.tsx` — `!==` 로 교체

### M4. `escapeRegex` 함수 중복 정의 ✅

- `src/lib/utils.ts` 로 통합, `posts.tsx` / `tags/route.ts` 에서 import로 교체

---

## 테스트 커버리지 (Testing)

### T1. 핵심 로직 테스트 부재

전체 182개 파일 중 테스트 파일 6개 (유틸리티 위주).

테스트 없는 핵심 영역:

| 영역 | 파일 |
|---|---|
| 업적 시스템 | `src/lib/achievements.tsx` |
| API 라우트 전체 | `src/app/api/*/route.tsx` |
| 무한 스크롤 페이지네이션 | `src/app/infinite-post.section.tsx` |
| 좋아요/댓글 상태 동기화 | `like.section.tsx`, `comments.section.tsx` |

---

## 개선 체크리스트

### High
- [ ] D1. `src/lib/env.ts` — 환경변수 중앙화
- [ ] D2. `src/lib/require-auth.ts` — API 인증 헬퍼 추출
- [ ] D5. `ApiResponse<T>` 표준 타입 + 라우트 적용

### Medium
- [ ] D3. `src/lib/api-client.ts` — fetch 클라이언트 통일
- [ ] D4. `show-achievement-toast` 유틸 추출
- [ ] D6. 좋아요 상태 DB 조회로 전환
- [ ] D7. `comments.section.tsx` — `useComments` 훅 + 컴포넌트 분리
- [ ] T1. 업적 시스템 / API 라우트 테스트 추가

### Low
- [ ] M1. posts aggregation `$lookup` 중복 제거
- [x] M2. 환경변수 검증 방식 교체
- [x] M3. `!=` → `!==`
- [x] M4. `escapeRegex` 공통 유틸로 이동
