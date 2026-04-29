# Security Review

보안 취약점 목록 및 수정 계획. 심각도 순으로 정렬.

---

## Critical

### C-1 — 시크릿 하드코딩 (.env.local)

- **파일**: `.env.local`
- **설명**: Google OAuth, MinIO, NextAuth 시크릿이 파일에 평문 저장. `.gitignore`에 등록되어 커밋은 안 됐으나 유출 가능성 있음
- **수정**: 해당 시크릿 즉시 로테이션 후 재발급

---

## High

### ✅ H-1 — 파일 업로드 인증 없음

- **파일**: `src/app/api/upload/route.tsx`
- **설명**: `POST /api/upload`에 `requireAuth()` 미호출. 미인증 사용자가 MinIO에 임의 파일 무제한 업로드 가능
- **수정**: 핸들러 최상단에 `requireAuth()` 추가

### ✅ H-2 — 파일 업로드 MIME 타입 미검증

- **파일**: `src/app/api/upload/upload.utils.ts`
- **설명**: 파일 존재 여부만 확인, MIME 타입·확장자 검증 없음. `.html`, `.svg`, `.exe` 등 업로드 가능
- **수정**:
  ```typescript
  const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { ok: false, error: 'Invalid file type' };
  }
  ```
  추가로 파일 magic bytes 검증 권장

### ✅ H-3 — 게시글 수정 IDOR + Mass Assignment

- **파일**: `src/app/api/submit/route.tsx:39-57`
- **설명**: 수정 시 `existingPost.userEmail !== auth.email` 검증 없음. 타인 게시글 `_id`를 알면 덮어쓰기 가능. `existingPost.set(payload)`로 클라이언트 payload를 검증 없이 전체 적용 (Mass Assignment)
- **수정**:
  ```typescript
  const existingPost = await Post.findById(payload._id);
  if (!existingPost) { /* 404 */ }
  if (existingPost.userEmail !== auth.email) {
    return apiError('수정 권한이 없습니다.', HttpStatusCode.Forbidden);
  }
  const { title, htmlContent, jsonContent, tags } = payload;
  existingPost.set({ title, htmlContent, jsonContent, tags });
  ```

### ✅ H-4 — 좋아요 POST 인증 없음

- **파일**: `src/app/api/like-dislike/route.tsx:25-82`
- **설명**: `GET`은 `requireAuth()` 호출하지만 `POST`는 인증 없음. 비로그인 사용자가 반복 호출로 좋아요 수 무제한 조작 가능
- **수정**: `POST` 핸들러에 `requireAuth()` 추가

### ✅ H-5 — 프로덕션 소스맵 노출

- **파일**: `next.config.ts:30`
- **설명**: `productionBrowserSourceMaps: true` 설정으로 원본 TypeScript 소스가 브라우저에서 공개됨
- **수정**: 해당 설정 제거 또는 `false`로 변경

### ✅ H-6 — 미들웨어 파일명 오타 (CSP 미적용)

- **파일**: `src/app/moddleware.ts` → `src/middleware.ts`
- **설명**: 파일명이 `moddleware.ts` (d 두 개)로 Next.js가 미들웨어로 인식하지 못해 CSP가 전혀 적용되지 않았음. `d6e0b41`에서 수정 완료.
- **현황**: CSP 활성화 후 앱 전체 인라인 스타일·스크립트 차단 이슈 발생 → H-9 참고

### ✅ H-7 — 보안 헤더 누락

- **파일**: `next.config.ts`, `src/app/middleware.ts`
- **설명**: 아래 헤더 미설정
  - `Strict-Transport-Security` (HSTS)
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy`
  - `Permissions-Policy`
- **수정**: `next.config.ts`의 `headers()` 또는 미들웨어에 추가

### ✅ H-8 — next DoS 취약점

- **파일**: `package.json`
- **설명**: `next <15.3.9`에 HTTP 요청 역직렬화 DoS 취약점 (GHSA-h25m-26qc-wcjf)
- **수정**: `pnpm update next`

---

## Medium

### ✅ M-2 — pagination limit 상한선 없음

- **파일**: `src/app/api/posts/route.tsx`
- **수정**: `Math.min(limit, 50)`, `Math.max(page, 1)` 적용

### ✅ M-3 — 게시글 본문 크기 제한 없음

- **파일**: `src/app/api/submit/route.tsx`
- **수정**: htmlContent/jsonContent 각 2MB 초과 시 413 반환

### ✅ M-6 — axios DoS 취약점 (GHSA-43fc-jf86-j433)

- **수정**: axios 1.13.2 → 1.15.2

### ✅ M-7 — minio fast-xml-parser 취약점 (GHSA-m7jm-9gc2-mpf2)

- **수정**: minio 8.0.6 → 8.0.7

---

### M-1 — 익명 댓글 Rate Limiting 없음

- **파일**: `src/app/api/comments/route.tsx`
- **설명**: 비로그인 익명 댓글 POST에 Rate Limiting 없음. `anonid`는 클라이언트 localStorage 기반이라 임의 값으로 스팸 가능
- **수정**: IP 기반 Rate Limiting 적용 또는 댓글 로그인 필수 전환

### M-2 — pagination limit 상한선 없음

- **파일**: `src/app/api/posts/route.tsx:9-10`
- **설명**: `?limit=100000` 같은 요청으로 MongoDB 대량 읽기 유발 가능 (DoS)
- **수정**:
  ```typescript
  const limit = Math.min(parseInt(searchParams.get('limit') || '9', 10), 50);
  const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
  ```

### M-3 — 게시글 본문 크기 제한 없음

- **파일**: `src/app/api/submit/route.tsx`
- **설명**: `jsonContent`, `htmlContent` 크기 제한 없어 수십 MB 본문으로 MongoDB 용량 고갈 가능
- **수정**: JSON 직렬화 후 바이트 길이 검사 추가

### M-6 — axios DoS 취약점

- **파일**: `package.json` (axios ^1.13.2)
- **설명**: `axios >=1.0.0 <=1.13.4`에서 `__proto__` DoS 취약점 (GHSA-43fc-jf86-j433)
- **수정**: `pnpm update axios` (1.13.5 이상)

### M-7 — minio 의존성 취약점 (fast-xml-parser)

- **파일**: `package.json`
- **설명**: minio가 의존하는 `fast-xml-parser`에 entity encoding bypass 취약점 (GHSA-m7jm-9gc2-mpf2)
- **수정**: `pnpm update minio`

---

## Low

### ✅ L-1 — 서버 로그에 사용자 이메일 평문 기록

- **파일**: `src/app/api/submit/route.tsx`, `src/app/api/comments/route.tsx`
- **수정**: `console.log`에서 이메일 변수 제거

### ✅ L-2 — JSON-LD XSS

- **파일**: `src/app/post/view/[[...id]]/page.tsx`
- **수정**: `JSON.stringify(jsonLd)` 후 `<`, `>`, `&` 유니코드 이스케이프 적용

### L-3 — CSRF 보호 미명시

- **설명**: NextAuth 기본값에 의존, `sameSite` 쿠키 옵션 미명시
- **수정**: NextAuth `cookies` 옵션에 `sameSite: 'lax'` 명시

### ✅ H-9 (1단계) — CSP script-src nonce 도입

- **수정**: `script-src 'unsafe-inline'` → `'nonce-{uuid}'` 로 교체
- **현황**: `style-src 'unsafe-inline'` 은 Tiptap 제약으로 유지
- **원래 설명** — CSP strict 모드 미적용 (unsafe-inline 임시 허용)

- **파일**: `src/middleware.ts`
- **설명**: 앱이 CSP를 고려하지 않고 설계되어 nonce 기반 strict CSP 적용 시 인라인 스타일·스크립트가 전면 차단됨. Tiptap, KaTeX 등 서드파티 라이브러리도 인라인 스타일 사용. 현재 `'unsafe-inline'`을 임시 허용 중.
- **현황**: 임시 완화 상태 (`script-src 'self' 'unsafe-inline'`, `style-src 'self' 'unsafe-inline'`)
- **향후 수정**: 아래 작업 완료 후 hash 기반 static CSP로 전환
  1. 인라인 스타일 → CSS 클래스 전환
  2. 인라인 스크립트 제거
  3. 서드파티 라이브러리 nonce 지원 확인
  4. `script-src`에 hash 기반 허용 목록 적용

---

## 수정 우선순위

| 순위 | 항목 | 비고 |
|------|------|------|
| 1 | C-1 시크릿 로테이션 | 즉시 |
| 2 | H-1 업로드 인증 추가 | |
| 3 | H-2 MIME 타입 검증 | |
| 4 | H-3 소유권 검증 + allowlist | |
| 5 | H-4 좋아요 인증 추가 | |
| 6 | H-5 소스맵 비활성화 | |
| 7 | ✅ H-6 미들웨어 파일명 수정 | 완료 |
| 8 | H-7 보안 헤더 추가 | |
| 9 | H-8, M-6, M-7 패키지 업그레이드 | `pnpm update next axios minio` |
| 10 | ✅ M-2 limit 상한선 | 완료 |
| 11 | ✅ L-2 JSON-LD 이스케이프 | 완료 |
| 12 | H-9 static CSP 전환 | 인라인 스타일·스크립트 제거 후 진행 |
