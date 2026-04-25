# Plan

## 1. 태그 클라우드 검색 가능하도록 ✅
- `src/app/tags/page.tsx`에 검색 입력창 추가
- `src/app/tags/tag-cloud-search.tsx`에서 로드된 태그를 클라이언트에서 필터링
- 검색 결과 없을 때 안내 메시지 표시
- 테스트 추가: `src/app/tags/tag-cloud-search.helpers.ts`, `src/app/tags/tag-cloud-search.test.ts`

## 2. 작성 페이지 임시 저장
- 구현 위치: `src/app/post/write/[[...id]]/writer-form.section.tsx`
- 저장 대상
  - 제목(`title`)
  - 태그(`tags`)
  - 에디터 내용 (`htmlContent`, `jsonContent`)
  - 업로드 이미지 URL 배열(`urls`)
- 저장 방식
  - 브라우저 `localStorage` 사용
  - draft key: `postDraft-new` 또는 `postDraft-<postId>`
  - 수정 모드와 신규 작성 모드를 별도 키로 분리
- 트리거
  - `beforeunload` 이벤트로 페이지 이탈 시 저장
  - 언마운트 시 마지막 저장 수행
- 복구
  - 페이지 로드 시 `localStorage`에서 draft 확인
  - draft가 있으면 제목/태그/에디터 내용을 복구
  - 복구 시 사용자 안내 메시지 표시
- 제출 후 처리
  - 게시글 저장 성공 시 해당 draft 삭제
- 추가 고려
  - 빈 상태(제목/태그/내용 모두 없음)에서는 draft 삭제
  - 로드된 기존 게시글 데이터와 draft 우선순위 결정
  - 다음 단계: draft 복구 UI 표시(예: "임시 저장된 내용이 있습니다. 복원하시겠습니까?")

## 3. 작성글 revision 처리
- 백엔드 `src/app/api/submit/route.tsx`는 수정 시 `PostRevision` 저장 이미 존재
- 프론트엔드에 revision 목록 UI 추가
- `src/lib/revisions.tsx` 활용
- revision 별 `version`, `작성일`, `제목` 표시
- 선택 시 에디터에 과거 버전 로드 또는 복원 기능

## 4. 작성/보기 화면 위/아래 꽉 차도록 처리

### 검토 결과

**사용자 관점**
- 작성 페이지: 에디터가 화면을 가득 채워 더 넓고 몰입감 있는 글쓰기 경험 제공
- 보기 페이지: 짧은 글도 여백 없이 화면을 채워 레이아웃 일관성 유지
- 두 페이지 모두 현재 `min-h-[480px]`(고정 최솟값)로 인해 큰 화면에서 빈 여백이 남음

**관리자 관점**
- 관리자 기능 미구현으로 직접 영향 없음
- 향후 관리 페이지 추가 시 동일 패턴 적용 가능

**개발자 관점**
- 단순히 `min-h-screen`을 해당 컴포넌트에 추가하는 방식은 Navbar/Footer 높이를 고려하지 않아 부적합
- CSS `calc(100vh - 고정px)` 방식은 Navbar 높이를 하드코딩해야 해서 유지보수 취약
- **채택: flex 체인 방식** — 조상부터 자식까지 `flex flex-col`을 연결하고, 에디터/콘텐츠 박스에 `flex-1` 부여
  ```
  <body>            flex flex-col min-h-dvh
    <Navbar />      고정 높이
    <main>          flex-1 flex flex-col     ← children이 stretch 가능
      <Page div>    flex-1 flex flex-col
        <Form div>  flex-1 flex flex-col     (작성 페이지만)
          editor    flex-1 min-h-[240px]     ← 화면 나머지를 채움
    <Footer />      고정 높이
  ```
- `min-h-screen`(`100vh`) 대신 `min-h-dvh`(`100dvh`) 사용: 모바일 브라우저 주소창 높이를 동적으로 반영
- 다른 페이지(홈, 태그 등)는 flex-1을 사용하지 않아 자체 콘텐츠 높이로 동작, 영향 없음

**데스크톱**
- Navbar(~56px) + Footer(~100px) 제외, 나머지를 에디터가 채움
- 1920×1080 기준 약 920px 에디터 높이 확보

**모바일**
- `100vh`는 iOS Safari에서 주소창 포함 계산으로 스크롤 발생 가능 → `100dvh` 사용으로 해결
- 소프트 키보드 활성화 시 `dvh` 단위가 동적으로 조정됨
- 모바일에서는 에디터가 키보드 위 공간까지만 채우고, 이하는 스크롤로 대응

### 변경 파일
- `src/app/layout.tsx` — body에 `flex flex-col min-h-dvh`, main에 `flex-1 flex flex-col`
- `src/app/post/write/[[...id]]/page.tsx` — wrapper에 `flex-1 flex flex-col`
- `src/app/post/write/[[...id]]/writer-form.section.tsx` — root에 `flex flex-col flex-1`, 에디터 wrapper `min-h-[480px]` → `flex-1 min-h-[240px]`
- `src/app/post/view/[[...id]]/page.tsx` — wrapper에 `flex-1 flex flex-col`, 콘텐츠 박스 `min-h-[480px]` → `flex-1 min-h-[240px]`

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
