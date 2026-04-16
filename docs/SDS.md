# System Design Specification (SDS)

## 1. 시스템 개요

Handmade Site는 Next.js App Router 기반의 웹 애플리케이션으로, MongoDB/Mongoose를 통한 데이터 저장과 `next-auth` 세션 인증을 결합한 모놀리식 구조입니다. 게시글, 댓글, 태그, 사용자 프로필, 업적, 이미지 업로드를 하나의 코드베이스에서 처리합니다.

## 2. 데이터 모델

### 2.1 Post

- `_id`: ObjectId
- `title`: string
- `htmlContent`: string
- `jsonContent`: object
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

### 2.2 Comment

- `_id`: ObjectId
- `post`: ObjectId(`Post`)
- `parent`: ObjectId(`Comment`) | null
- `author`: string
- `authorId`: ObjectId(`User`) | null
- `content`: string
- `likes`: number
- `createdAt`: Date
- `isDeleted`: boolean
- `updatedAt`, `createdAt`: timestamps

### 2.3 User

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

### 2.4 Achievement

- `_id`: ObjectId
- `key`: string
- `name`: string
- `description`: string
- `icon`: string
- `points`: number

### 2.5 PostRevision

- `_id`: ObjectId
- `postId`: ObjectId(`Post`)
- `title`: string
- `htmlContent`: string
- `jsonContent`: object
- `author`: string
- `userEmail`: string
- `version`: number
- `createdAt`: Date

## 3. API 설계

### 3.1 인증

- `src/app/api/auth/[...nextauth]/route.ts`
- Google, GitHub OAuth
- `signIn` 콜백에서 MongoDB 사용자 생성/갱신
- 로그인 상태는 `getServerSession(authOptions)`로 검증

### 3.2 게시글

- `GET /api/posts?page=&limit=&sort=&email=`: 게시글 목록
- `GET /api/post?_id=...`: 게시글 상세
- `POST /api/submit`: 게시글 생성/수정
- `DELETE /api/post`: 게시글 삭제

### 3.3 댓글

- `GET /api/comments?postId=...`: 댓글 목록
- `POST /api/comments`: 댓글 작성
- `DELETE /api/comments`: 댓글 삭제

### 3.4 태그

- `GET /api/tags?q=...`: 태그 검색 및 자동완성
- `GET /api/tags`: 전체 태그 목록

### 3.5 업로드

- `POST /api/upload`: 이미지 및 썸네일 업로드

### 3.6 사용자

- `GET /api/user/profile`: 현재 사용자 프로필
- `GET /api/user/settings`: 사용자 설정 조회
- `PUT /api/user/settings`: 사용자 설정 업데이트
- `GET /api/my-achievements`: 사용자 업적 목록

### 3.7 좋아요/싫어요

- `POST /api/like-dislike`: 게시글 추천/비추천 처리

## 4. 시스템 컴포넌트

### 4.1 프론트엔드

- `src/app/page.tsx`: 홈
- `src/app/post/view/[[...id]]/page.tsx`: 게시글 상세
- `src/app/post/write/[[...id]]/page.tsx`: 게시글 작성/수정
- `src/app/tags/page.tsx`, `src/app/tags/[tag]/page.tsx`: 태그 기반 탐색
- `src/app/dashboard/*`: 사용자 대시보드
- `src/app/login/page.tsx`: 로그인

### 4.2 UI 컴포넌트

- `src/components/navbar.tsx`
- `src/components/footer.tsx`
- `src/components/post-item.tsx`
- `src/components/rich-web-editor/editor.tsx`
- `src/components/rich-web-editor/viewer.tsx`
- `src/components/achievement-toast.tsx`

### 4.3 공통 라이브러리

- `src/lib/db.tsx`: MongoDB 연결 관리
- `src/lib/posts.tsx`: 게시글/태그/조회수/삭제 도메인 로직
- `src/lib/achievements.tsx`: 업적 및 포인트 로직
- `src/lib/revisions.tsx`: 게시글 개정 정보

### 4.4 데이터베이스

- MongoDB + Mongoose
- 공통 연결: `connectToDB()`
- `Post`, `Comment`, `User`, `Achievement`, `PostRevision` 모델

## 5. 데이터 흐름

### 5.1 게시글 목록

1. 서버 컴포넌트가 `getPaginatedPosts` 호출
2. MongoDB aggregate로 `isDeleted` 필터, 정렬, 페이지 처리
3. 댓글 수를 추가 계산 후 응답

### 5.2 게시글 작성/수정

1. 클라이언트 `POST /api/submit`
2. 세션 확인 및 이메일 검증
3. `Post.create` 또는 `Post.findById` 후 업데이트
4. 수정 시 `PostRevision`에 이전 버전 저장
5. 생성 시 `User.points` 증가, 업적 검증

### 5.3 댓글 작성

1. `POST /api/comments`
2. 로그인 여부에 따라 `authorId` 또는 익명 `anonid` 생성
3. 저장 후 로그인 사용자에 한해 포인트 및 업적 부여

### 5.4 삭제 흐름

1. `DELETE /api/post` 요청 시 작성자 검증
2. `Post.isDeleted` true, `deletedAt` 기록
3. 연관 댓글도 `isDeleted`로 처리
4. 사용자 포인트 차감

## 6. 비기능 요구사항

### 6.1 성능

- `posts` 집계 파이프라인으로 서버에서 페이지네이션 처리
- 조회수 및 댓글 집계는 최소한의 쿼리로 처리
- 이미지 업로드는 비동기적 MinIO 저장

### 6.2 보안

- `next-auth` 기반 인증
- 세션/이메일 일치 검증
- 리소스 소유권 검사(게시글 삭제, 댓글 삭제)
- soft delete 처리로 삭제된 콘텐츠가 즉시 노출되지 않음

### 6.3 유지보수성

- 책임별 디렉토리 분리
- 재사용 가능한 라이브러리 함수
- 모델 중심 도메인 설계

### 6.4 운영

- 필수 환경 변수: DB, NextAuth, MinIO, OAuth 키
- 로컬 개발, 빌드, 실행 스크립트는 `package.json`에 정의
- 배포 대상: Vercel, Node 서버, Docker

## 7. 추가 고려사항

- 현재 관리/신고 기능은 구현되지 않음
- 댓글 및 게시글 조회 API는 캐싱이 없음
- 파일 업로드 검증이 최소 수준으로 구현됨
- 테스트 계획 및 문서화가 비어 있음
