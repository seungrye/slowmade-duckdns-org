# 보안 취약점 현황

심각도 순 정렬. 완료 / 잔여로 표시.

---

## Critical

| 항목 | 설명 | 상태 |
|------|------|------|
| C-1 | `.env.local` 시크릿 평문 저장 — Google OAuth, MinIO, NextAuth 시크릿 로테이션 | 사용자 직접 수행 |

---

## High

| 항목 | 설명 | 상태 |
|------|------|------|
| H-1 | `POST /api/upload` 인증 없음 → `requireAuth()` 추가 | 완료 |
| H-2 | 파일 업로드 MIME 타입 미검증 → 화이트리스트 검증 추가 | 완료 |
| H-3 | 게시글 수정 IDOR + Mass Assignment → 소유권 검증, 허용 필드 제한 | 완료 |
| H-4 | `POST /api/like-dislike` 인증 없음 → `requireAuth()` 추가 | 완료 |
| H-5 | 프로덕션 소스맵 노출 → `productionBrowserSourceMaps` 제거 | 완료 |
| H-6 | 미들웨어 파일명 오타 (`moddleware.ts`) → `middleware.ts` 로 수정 | 완료 |
| H-7 | 보안 헤더 누락 → HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy 추가 | 완료 |
| H-8 | next DoS 취약점 (GHSA-h25m-26qc-wcjf) → 15.5.15 업그레이드 | 완료 |
| H-9 | CSP `script-src 'unsafe-inline'` → nonce 기반 전환 | 완료 (1단계) |
| H-9 (2단계) | `style-src 'unsafe-inline'` 제거 — Tiptap 인라인 스타일 CSS 클래스 전환 선행 필요 | 잔여 |

---

## Medium

| 항목 | 설명 | 상태 |
|------|------|------|
| M-1 | 익명 댓글 Rate Limiting 없음 — IP 기반 인메모리 Rate Limiting | 잔여 |
| M-2 | pagination `limit` 상한선 없음 → `Math.min(limit, 50)`, `Math.max(page, 1)` | 완료 |
| M-3 | 게시글 본문 크기 제한 없음 → htmlContent/jsonContent 2MB 초과 시 413 | 완료 |
| M-6 | axios DoS 취약점 (GHSA-43fc-jf86-j433) → 1.15.2 업그레이드 | 완료 |
| M-7 | minio fast-xml-parser 취약점 (GHSA-m7jm-9gc2-mpf2) → 8.0.7 업그레이드 | 완료 |

---

## Low

| 항목 | 설명 | 상태 |
|------|------|------|
| L-1 | 서버 로그 이메일 평문 기록 → `console.log`에서 이메일 변수 제거 | 완료 |
| L-2 | JSON-LD XSS → `<`, `>`, `&` 유니코드 이스케이프 | 완료 |
| L-3 | CSRF — NextAuth `cookies.sessionToken.options.sameSite: 'lax'` 미명시 | 잔여 |
