# System Design Specification (SDS)

시스템 개요 및 아키텍처는 [architecture.md](architecture.md)를 참조.

## 1. 데이터 모델

### 1.1 Post

- `_id`: ObjectId
- `title`: string
- `htmlContent`: string (렌더링용 HTML)
- `jsonContent`: object (TipTap 재편집용 JSON)
- `urls`: Array<{ url: string; thumbnailUrl: string }>
- `author`: string
- `userEmail`: string
- `likes`: number
- `views`: number
- `version`: number
- `tags`: string[]
- `isDeleted`: boolean
- `deletedAt`: Date | null
- `createdAt`, `updatedAt`: timestamps
- 인덱스: `tags`, `isDeleted`

### 1.2 Comment

- `_id`: ObjectId
- `post`: ObjectId(`Post`)
- `parent`: ObjectId(`Comment`) | null
- `author`: string
- `authorId`: ObjectId(`User`) | null
- `content`: string
- `likes`: number
- `isDeleted`: boolean
- `createdAt`, `updatedAt`: timestamps

### 1.3 User

- `_id`: ObjectId
- `username`: string
- `email`: string
- `password`: string | undefined
- `profileImage`: string
- `providers`: string[]
- `achievements`: [{ achievement: ObjectId(`Achievement`); unlockedAt: Date }]
- `settings`: { theme: 'light' | 'dark' | 'system' }
- `points`: number
- `createdAt`, `updatedAt`: timestamps

### 1.4 Achievement

- `_id`: ObjectId
- `key`: string
- `name`: string
- `description`: string
- `icon`: string
- `points`: number

### 1.5 PostRevision

- `_id`: ObjectId
- `postId`: ObjectId(`Post`)
- `title`: string
- `htmlContent`: string
- `jsonContent`: object
- `author`: string
- `userEmail`: string
- `version`: number
- `createdAt`: Date

## 2. API 설계

### 2.1 인증

- `GET/POST /api/auth/[...nextauth]`
- Google, GitHub OAuth 프로바이더 지원
- `signIn` 콜백에서 MongoDB 사용자 생성/갱신 및 `providers` 업데이트
- 세션 검증: `getServerSession(authOptions)`

### 2.2 게시글

- `GET /api/posts?page=&limit=&sort=&email=` — 게시글 목록 (무한 스크롤용 페이징)
- `GET /api/post?_id=` — 단일 게시글 조회
- `POST /api/submit` — 게시글 생성/수정
  - `payload._id` 있으면 수정, 없으면 생성
  - 수정 시 `PostRevision`에 이전 버전 저장
  - 생성 시 `User.points` 증가 및 업적 검증
  - 응답에 신규 업적 및 획득 포인트 포함
- `DELETE /api/post` — 게시글 소프트 삭제
  - 작성자 본인만 삭제 가능
  - 연관 댓글도 `isDeleted` 처리
  - `User.points` 차감

### 2.3 댓글

- `GET /api/comments?postId=` — 댓글 목록 (삭제된 댓글은 내용 대체)
- `POST /api/comments` — 댓글 작성
  - 로그인: `authorId` 설정, 포인트 및 업적 부여
  - 비로그인: `anonid`를 base-5 인코딩하여 익명 닉네임 생성
- `DELETE /api/comments` — 작성자만 소프트 삭제

### 2.4 태그

- `GET /api/tags?q=` — 태그 자동완성/검색 (대소문자 무시 정규식)
- `GET /api/tags` — 전체 태그 목록
- `GET /api/tags/[tag]` — 특정 태그가 포함된 게시글 목록

### 2.5 업로드

- `POST /api/upload` — 이미지 + 썸네일 업로드
  - 클라이언트에서 사전 압축 후 `multipart/form-data`로 전송
  - MinIO에 원본과 썸네일 저장, 두 URL 반환

### 2.6 좋아요/싫어요

- `POST /api/like-dislike` — 게시글 추천/비추천 (`likes` ≥ 0 보장)
- 상호작용 후 업적 검증 실행

### 2.7 사용자

- `GET /api/user/profile` — 현재 사용자 프로필
- `GET /api/user/settings` — 테마 설정 조회
- `PUT /api/user/settings` — 테마 설정 업데이트
- `GET /api/my-achievements` — 사용자 업적 목록

## 3. 시스템 컴포넌트

### 3.1 페이지 라우트

- `src/app/page.tsx` — 홈 (게시글 목록)
- `src/app/post/view/[[...id]]/page.tsx` — 게시글 상세
- `src/app/post/write/[[...id]]/page.tsx` — 게시글 작성/수정
- `src/app/tags/page.tsx` — 태그 클라우드
- `src/app/tags/[tag]/page.tsx` — 태그별 게시글 목록
- `src/app/dashboard/*` — 사용자 대시보드
- `src/app/login/page.tsx` — 로그인

### 3.2 주요 컴포넌트

- `src/components/rich-web-editor/editor.tsx` — TipTap 에디터 (이미지 업로드 포함)
- `src/components/rich-web-editor/viewer.tsx` — 게시글 뷰어
- `src/components/post-item.tsx` — 게시글 목록 아이템
- `src/components/achievement-toast.tsx` — 업적 획득 알림

### 3.3 공통 라이브러리

- `src/lib/db.tsx` — MongoDB 싱글턴 연결 (`connectToDB()`)
- `src/lib/posts.tsx` — 게시글/태그/조회수/삭제 도메인 로직
- `src/lib/achievements.tsx` — 업적 정의 및 자동 부여 로직
- `src/lib/revisions.tsx` — 게시글 개정 이력

## 4. 데이터 흐름

### 4.1 게시글 목록 조회

1. 서버 컴포넌트에서 `lib/posts.tsx`의 `getPaginatedPosts` 직접 호출
2. MongoDB aggregate: `isDeleted` 필터 → 정렬 → 페이지 처리 → 댓글 수 집계
3. SSR로 렌더링된 HTML 반환, 이후 스크롤 시 클라이언트가 `/api/posts` 호출

### 4.2 게시글 작성/수정

1. TipTap 에디터에서 `htmlContent` + `jsonContent` 모두 포함하여 `POST /api/submit`
2. 세션 확인 → Zod 유효성 검사
3. 신규: `Post.create` → `User.points` 증가 → 업적 검증
4. 수정: `PostRevision` 저장 → `Post.findByIdAndUpdate`

### 4.3 댓글 작성

1. 클라이언트 → `POST /api/comments`
2. 세션 없으면 `nanoid` 기반 익명 닉네임으로 `author` 설정
3. `Comment.create` → 로그인 사용자라면 포인트 + 업적 부여

### 4.4 이미지 업로드

1. 클라이언트: `browser-image-compression`으로 압축
2. `POST /api/upload` (`multipart/form-data`: 원본 + 썸네일)
3. MinIO에 저장 → `{ url, thumbnailUrl }` 반환
4. 에디터가 반환된 URL을 `htmlContent`/`jsonContent`에 삽입
