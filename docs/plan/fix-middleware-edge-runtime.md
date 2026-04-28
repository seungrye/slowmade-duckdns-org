---
issue: bugfix
title: 미들웨어 Edge Runtime 호환 수정
status: ✅ done
---

## 문제

`src/middleware.ts`에서 Node.js `crypto` 모듈을 import해 Edge Runtime에서 런타임 오류 발생.
`Buffer`도 Node.js 전용 전역이라 Edge Runtime에서 미사용.

## 수정 내용

- `import crypto from 'crypto'` 제거 → 전역 Web Crypto API `crypto.randomUUID()` 사용
- `Buffer.from(...).toString('base64')` → `btoa(...)` 로 교체
