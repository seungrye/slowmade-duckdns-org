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

## H-3 — 게시글 수정 IDOR + Mass Assignment (완료)
`src/app/api/submit/route.tsx`
- `existingPost.userEmail !== auth.email` 소유권 검증 → 403
- `existingPost.set(payload)` → `existingPost.set({ title, htmlContent, jsonContent, tags })`

## H-4 — 좋아요 POST 인증 추가 (완료)
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

## ✅ editor.upload.tsx 응답 파싱 버그 수정
`response.data.url` → `response.data.data.url` 수정.
`apiSuccess`가 `{ success, data }` 래퍼로 반환하는데 클라이언트가 `.data.url`로 읽어 항상 undefined.
MinIO 업로드는 성공하지만 URL이 에디터에 전달되지 않아 "No URL returned" 에러 발생.

## ✅ CSP worker-src 누락 수정

## ✅ CSP script-src에 cdn.jsdelivr.net 추가
`src/middleware.ts` `script-src`에 `https://cdn.jsdelivr.net` 추가.
`browser-image-compression` Web Worker가 jsDelivr CDN에서 라이브러리를 importScripts()로 로드.
현재 unsafe-inline 존재로 실질적 CSP 약화는 미미. H-9(static CSP) 전환 시 재검토 예정.
`src/middleware.ts`에 `worker-src 'self' blob:` 추가.
`browser-image-compression`이 blob URL Web Worker를 사용하는데 `worker-src` 미설정 시
`script-src` fallback 적용 → blob: 차단됨.

## ✅ CSP img-src 외부 이미지 허용
`src/middleware.ts` `img-src`에 `https:` 추가.
기존: 특정 도메인만 허용 (minio, googleusercontent)
수정: `https:` 추가하여 HTTPS 이미지 전체 허용
이유: 게시글에 붙여넣기 된 외부 이미지(huggingface.co 등) CSP 차단 문제
