# Plan

## 완료 항목

### 1. 태그 클라우드 검색 ✅
- `src/app/tags/tag-cloud-search.tsx`에서 클라이언트 측 필터링
- 검색 결과 없을 때 안내 메시지 표시
- 테스트: `src/app/tags/tag-cloud-search.helpers.ts`, `src/app/tags/tag-cloud-search.test.ts`
- 버그 수정: 긴 태그명으로 인한 모바일 수평 스크롤 (`break-all` 적용)

### 8. 디자인 시스템 기초 ✅
- `src/lib/cn.ts` — clsx + tailwind-merge 기반 클래스 병합 유틸리티
- `src/components/ui/` — Button, Card, Input, Badge 프리미티브 컴포넌트
  - variant/size props로 일관된 스타일 표현
  - `.variants.ts`로 순수 설정 분리 → 단위 테스트 가능
- `globals.css @theme` — brand 색상 토큰, shadow-card 추가
- 적용: input-search, modal, my-profile, post view 태그

---

## 미완료 항목

### 2. 작성 페이지 임시 저장
- 구현 위치: `src/app/post/write/[[...id]]/writer-form.section.tsx`
- 저장 대상: 제목, 태그, 에디터 내용 (`htmlContent`, `jsonContent`), 이미지 URL 배열
- 저장 방식: `localStorage` 사용, draft key: `postDraft-new` / `postDraft-<postId>`
- 트리거: `beforeunload` 이벤트 및 언마운트 시
- 복구: 페이지 로드 시 draft 확인 후 사용자 안내 메시지 표시
- 제출 후 처리: 저장 성공 시 draft 삭제

### 3. 작성글 revision UI
- 백엔드: `GET /api/post/revisions?postId=` 이미 구현됨
- 단일 revision 조회 API (`GET /api/post/revision?revisionId=`) 추가 필요
- 프론트엔드에 revision 목록 패널 추가
  - 버전별 `version`, 작성일, 제목 표시
  - 두 버전 선택 후 단어 단위 diff 비교 (GitHub wiki 스타일)
  - 선택한 버전을 에디터에 복원하는 기능

### 4. 작성/보기 화면 전체 높이 채우기
- `src/app/post/write/[[...id]]/writer-form.section.tsx`
- `src/app/post/view/[[...id]]/page.tsx`
- 현재 `min-h-[480px]` → flex 레이아웃으로 화면 나머지 영역을 채우도록 변경
- `layout.tsx` body/main에 flex 구조 추가 필요
- 주의: `flex` 컨텍스트에서 페이지 래퍼의 `mx-auto`가 마진으로 동작하는 버그 고려

### 5. 태그 검색된 자료 바로보기
- `src/app/tags/[tag]/page.tsx`
- 결과 리스트 항목 전체를 클릭 가능하도록 변경
- 제목 빈 곳 클릭 시 상세 페이지 이동

### 6. 작성글 바로보기 클릭 영역 확장
- `src/components/post-item.tsx`
- 하단 메타 영역(댓글 수, 좋아요 수) 빈 공간 클릭 시 상세 페이지 이동
- 카드 전체를 클릭 가능하게 구성

### 7. 작성순 / 갱신순 정렬 추가
- `src/lib/sort.tsx`에 `updated` 옵션 추가
- `src/lib/posts.tsx`에서 `updatedAt` 정렬 지원
- 메인/대시보드 정렬 UI에 `작성순`, `갱신순` 추가
- `src/app/api/user/settings/route.tsx`에 기본 정렬 설정 추가

---

## 우선순위 제안
1. 작성 페이지 임시 저장 (#2)
2. 작성/보기 화면 전체 높이 (#4)
3. 작성글 revision UI (#3)
4. 작성글 바로보기 클릭 영역 확장 (#6)
5. 작성순/갱신순 정렬 (#7)
6. 태그 검색된 자료 바로보기 (#5)
