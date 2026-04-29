---
title: Medium/Low 보안 이슈 수정 계획
status: plan
---

## 수정 대상

### M-2 — pagination limit 상한선 없음
**파일**: `src/app/api/posts/route.tsx`
- `page`: `Math.max(..., 1)` 으로 음수 방지
- `limit`: `Math.min(..., 50)` 으로 대량 읽기 방지

### M-3 — 게시글 본문 크기 제한 없음
**파일**: `src/app/api/submit/route.tsx`
- `htmlContent`, `jsonContent` 각각 2MB 상한선 검증
- `Buffer.byteLength`로 UTF-8 바이트 길이 측정
- 초과 시 413 PayloadTooLarge 반환

### M-6 — axios DoS 취약점 (GHSA-43fc-jf86-j433)
- `pnpm update axios` (1.13.5 이상으로 업그레이드)

### M-7 — minio fast-xml-parser 취약점 (GHSA-m7jm-9gc2-mpf2)
- `pnpm update minio`

### L-1 — 서버 로그 이메일 평문 기록
**파일**: `src/app/api/submit/route.tsx:69`, `src/app/api/comments/route.tsx:82`
- `console.log(... ${userEmail} ...)` 제거

### L-2 — JSON-LD XSS
**파일**: `src/app/post/view/[[...id]]/page.tsx:66`
- `JSON.stringify(jsonLd)` 후 `<`, `>`, `&` HTML 이스케이프 처리
  ```ts
  const safeJsonLd = JSON.stringify(jsonLd)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
  ```
