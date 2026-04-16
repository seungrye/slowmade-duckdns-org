# System Design Specification (SDS)

## 1. 시스템 개요

Handmade Site는 Next.js 기반 웹 애플리케이션으로, MongoDB와 Mongoose를 사용하여 게시글, 댓글, 사용자 정보를 저장합니다. 프론트엔드는 `app` 디렉터리의 서버/클라이언트 컴포넌트를 활용하고, 백엔드는 Next.js API 라우트를 사용합니다.

## 2. 데이터 모델

### 2.1 Post

- `_id`: string
- `title`: string
- `htmlContent`: string
- `jsonContent`: object
- `urls`: ImageUrl[]
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

- `_id`: string
- `post`: ObjectId(post)
- `author`: string
- `userEmail`: string
- `content`: string
- `createdAt`, `updatedAt`

### 2.3 User

- `name`, `email`, `image` 등 `next-auth` 프로필 정보
- 추가 프로필 정보는 `user` API에서 관리 가능

### 2.4 Achievement

- `_id`: string
- `title`: string
- `description`: string
- `type`: string
- `points`: number
- 기타 보상 조건

## 3. API 설계

### 3.1 인증

- `app/api/auth/[...nextauth]/route.ts` - NextAuth 인증 엔드포인트

### 3.2 게시글

- `GET /api/post?_id=...` - 단일 게시글 조회
- `DELETE /api/post` - 게시글 삭제
- `POST /api/submit` - 게시글 작성/수정 제출
- `GET /api/posts?page=&limit=&query=&sort=` - 게시글 목록 조회

### 3.3 댓글

- `GET /api/comments?postId=...` - 댓글 리스트 조회
- `POST /api/comments` - 댓글 작성

### 3.4 태그

- `GET /api/tags?query=...` - 태그 검색/자동완성
- `GET /api/tags/[tag]` - 특정 태그로 게시글 조회

### 3.5 업로드

- `POST /api/upload` - 이미지 업로드

### 3.6 사용자

- `GET /api/user` - 현재 사용자 정보 조회
- 프로필/설정 관련 API

### 3.7 좋아요/싫어요

- `POST /api/like-dislike` - 게시글 좋아요/싫어요 처리

## 4. 시스템 컴포넌트

### 4.1 프론트엔드

- Next.js App Router 기반 페이지
- `app/page.tsx`: 홈 페이지
- `app/post/view/[[...id]]/page.tsx`: 게시글 상세 페이지
- `app/post/write/[[...id]]/page.tsx`: 게시글 작성/수정 페이지
- `app/tags/page.tsx`, `app/tags/[tag]/page.tsx`: 태그 목록 및 태그별 게시글 목록
- `app/dashboard/*`: 사용자 대시보드

### 4.2 UI 컴포넌트

- `components/post-item.tsx` - 게시글 카드
- `components/rich-web-editor/editor.tsx` - 리치 에디터
- `components/rich-web-editor/viewer.tsx` - 에디터 렌더링 뷰어
- `components/navbar.tsx` - 상단 네비게이션
- `components/footer.tsx` - 페이지 하단 푸터
- `components/achievement-toast.tsx` - 보상 토스트

### 4.3 클라이언트/서버 구분

- 서버 컴포넌트: 페이지 대부분, 데이터 페칭, SEO 메타데이터
- 클라이언트 컴포넌트: 리치 에디터, 무한 스크롤, 토글, 폼 입력, 툴바

## 5. 데이터 흐름

1. 클라이언트가 페이지를 방문하면 서버 컴포넌트가 데이터 베이스에서 게시글 목록을 로드합니다.
2. 작성 또는 댓글 제출 시 클라이언트는 API 엔드포인트로 POST 요청을 전송합니다.
3. 서버는 Mongoose를 통해 MongoDB에 저장하고, 필요한 경우 인증 세션을 검증합니다.
4. 이미지 업로드는 S3 호환 저장소(MinIO) 또는 유사 파일 스토리지로 전송됩니다.

## 6. 기술 스택

- 프레임워크: Next.js 15
- UI: React 19, Tailwind CSS, Sass
- 리치 에디터: TipTap
- 상태 관리: React useState/useEffect 등 기본 훅
- 인증: next-auth
- DB: MongoDB + Mongoose
- 파일 업로드: MinIO 또는 S3 호환
- 알림: react-hot-toast

## 7. 배포 및 운영

- 로컬 개발: `pnpm dev` 또는 `npm run dev`
- 빌드: `pnpm build`
- 실행: `pnpm start`
- 호환 플랫폼: Vercel, 자체 Node 서버, Docker 기반 환경

## 8. 확장 계획

- 관리자 기능 추가(게시글/댓글 관리)
- 검색/필터링 개선
- 소셜 로그인 추가
- RAG/AI 기반 추천 기능
- 핵심 도메인 검증용 테스트 추가
