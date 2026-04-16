# Plan

## 1. 태그 클라우드 검색 가능하도록
- `src/app/tags/page.tsx`에 검색 입력창 추가
- 입력값 변경 시 `/api/tags?q=검색어` 호출
- 응답으로 태그 클라우드 필터링
- 검색 결과 없을 때 안내 메시지 표시

## 2. 작성 페이지 임시 저장
- `src/app/post/write/[[...id]]/writer-form.section.tsx`
- `title`, `tags`, 에디터 내용 저장
- 5초 간격 `localStorage`에 저장
- `beforeunload` 이벤트로 페이지 떠날 때 저장
- 페이지 로드 시 draft 복구
- 수정 모드와 신규 작성 모드 분리

## 3. 작성글 revision 처리
- 백엔드 `src/app/api/submit/route.tsx`는 수정 시 `PostRevision` 저장 이미 존재
- 프론트엔드에 revision 목록 UI 추가
- `src/lib/revisions.tsx` 활용
- revision 별 `version`, `작성일`, `제목` 표시
- 선택 시 에디터에 과거 버전 로드 또는 복원 기능

## 4. 작성/보기 화면 위/아래 꽉 차도록 처리
- `src/app/post/write/[[...id]]/writer-form.section.tsx`
- `src/app/post/view/[[...id]]/page.tsx`
- 현재 `min-h-[480px]` 레이아웃을 `min-h-screen`, `h-full`, `flex flex-col` 등으로 변경
- 상단, 에디터, 하단 영역이 화면 전체를 채우도록 재구성

## 5. 태그 검색된 자료 바로보기
- `src/app/tags/[tag]/page.tsx`
- 결과 리스트 항목 전체를 클릭 가능하도록 변경
- 제목창 빈 곳 클릭 시 상세 페이지 이동

## 6. 작성글 바로보기 클릭 영역 확장
- 게시글 카드 컴포넌트(`components/post-item.tsx` 등)
- 제목뿐 아니라 하단 메타 영역(`댓글 수`, `좋아요 수`) 빈 공간 클릭 시 이동
- 카드 전체를 클릭 가능하게 구성

## 7. 작성순 / 갱신순 정렬 추가
- `src/lib/sort.tsx`에 `updated` 옵션 추가
- `src/lib/posts.tsx`에서 `updatedAt` 정렬 지원
- 메인/대시보드 정렬 UI에 `작성순`, `갱신순` 추가
- 사용자 설정 저장: `src/app/api/user/settings/route.tsx`에 기본 정렬 설정 추가

## 우선순위 제안
1. 태그 클라우드 검색
2. 작성 페이지 임시 저장
3. 작성/보기 화면 전체 높이
4. 작성글 바로보기 클릭 영역 확장
5. 작성순/갱신순 정렬
6. revision UI
7. 태그 검색된 자료 바로보기
