---
title: H-9 CSP script-src nonce 도입 (unsafe-inline 제거)
status: plan
---

## 목표

`script-src`에서 `'unsafe-inline'` 제거 → nonce 기반으로 전환.
`style-src 'unsafe-inline'`은 Tiptap 동적 인라인 스타일 한계로 유지.

## 변경 범위

### 1. `src/middleware.ts`
- `crypto.randomUUID()` 로 요청마다 nonce 생성
- `script-src 'self' 'unsafe-inline'` → `script-src 'self' 'nonce-${nonce}'`
- `NextResponse.next({ request: { headers: requestHeaders } })` 로
  `x-nonce` / `content-security-policy` 헤더를 요청에 포함
  (Next.js App Router가 이 헤더를 읽어 자체 인라인 스크립트에 nonce 적용)

### 2. `src/app/layout.tsx`
- `async` 함수로 전환
- `headers().get('x-nonce')` 로 nonce 읽기
- 현재 `<Script>` 컴포넌트 없으므로 nonce 보관만 — 이후 추가 시 즉시 사용 가능

### 3. `src/middleware.test.ts`
- `'unsafe-inline'` 포함 테스트 → `nonce-` 포함 테스트로 교체
- `x-nonce` 요청 헤더 전달 검증 추가

## 비고
- `type="application/ld+json"` script 태그는 JavaScript가 아니므로 `script-src` 무관
- `cdn.jsdelivr.net` 은 browser-image-compression worker의 importScripts() 를 위해 유지
- `style-src 'unsafe-inline'` 은 현 단계에서 유지 (Tiptap 제약)
