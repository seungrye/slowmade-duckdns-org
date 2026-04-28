---
title: High 보안 이슈 수정 (H-1 ~ H-8, H-9 제외)
status: plan
---

## H-1 — 파일 업로드 인증 추가 (완료)
`src/app/api/upload/route.tsx` POST 핸들러 최상단에 `requireAuth()` 추가

## H-2 — MIME 타입 검증 추가 (완료)
`src/app/api/upload/upload.utils.ts` `validateUploadFormData`에
`ALLOWED_MIME_TYPES = ['image/jpeg','image/png','image/gif','image/webp']` 화이트리스트 검증 추가.
file, thumbnail 모두 검증.

## H-3 — 게시글 수정 IDOR + Mass Assignment
`src/app/api/submit/route.tsx`
- `existingPost.userEmail !== auth.email` 소유권 검증 → 403
- `existingPost.set(payload)` → `existingPost.set({ title, htmlContent, jsonContent, tags })`

## H-4 — 좋아요 POST 인증 추가
`src/app/api/like-dislike/route.tsx` POST 핸들러에 `requireAuth()` 추가.
`payload.userEmail` → `auth.email` 교체

## H-5 — 프로덕션 소스맵 제거
`next.config.ts`에서 `productionBrowserSourceMaps: true` 제거
(H-4 impl과 함께 커밋)

## H-7 — 보안 헤더 추가
`src/middleware.ts` 응답에 추가:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

## H-8 — next 패키지 업그레이드
`next 15.3.8 → 15.5.15` (DoS 취약점 해소)
(H-7 impl과 함께 커밋)
