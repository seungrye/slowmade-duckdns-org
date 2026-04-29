# 기능 개발 — 잔여

---

## #2. 작성 페이지 임시 저장
- **파일**: `src/app/post/write/[[...id]]/writer-form.section.tsx`
- 저장 대상: 제목, 태그, 에디터 내용 (`htmlContent`, `jsonContent`), 이미지 URL 배열
- 저장 방식: `localStorage`, draft key: `postDraft-new` / `postDraft-<postId>`
- 트리거: `beforeunload` 이벤트 및 언마운트 시
- 복구: 페이지 로드 시 draft 확인 후 사용자 안내

## #3. 작성글 revision UI
- 백엔드: `GET /api/post/revisions?postId=` 이미 구현됨
- 단일 revision 조회 API (`GET /api/post/revision?revisionId=`) 추가 필요
- 두 버전 선택 후 단어 단위 diff 비교 (GitHub wiki 스타일)
- 선택한 버전을 에디터에 복원하는 기능

## #4. 작성/보기 화면 전체 높이 채우기
- `src/app/post/write/[[...id]]/writer-form.section.tsx`
- `src/app/post/view/[[...id]]/page.tsx`
- `min-h-[480px]` → flex 레이아웃으로 화면 나머지 영역 채우기
- 주의: `flex` 컨텍스트에서 `mx-auto`가 마진으로 동작하는 버그 고려

## #5. 태그 검색된 자료 바로보기
- `src/app/tags/[tag]/page.tsx`
- 결과 리스트 항목 전체 클릭 가능하도록 변경

## #6. 작성글 바로보기 클릭 영역 확장
- `src/components/post-item.tsx`
- 카드 전체를 클릭 가능하게 구성

## #7. 작성순 / 갱신순 정렬 추가
- `src/lib/sort.tsx`에 `updated` 옵션 추가
- `src/lib/posts.tsx`에서 `updatedAt` 정렬 지원
- `src/app/api/user/settings/route.tsx`에 기본 정렬 설정 추가

---

## S9. URL slug 기반으로 변경 (대형 작업)
- 현재: `/post/view/[ObjectID]` → 개선: `/post/[slug]`
- DB 스키마에 `slug` 필드 추가, 기존 게시물 마이그레이션 필요
- 301 리디렉션으로 기존 URL 유지
