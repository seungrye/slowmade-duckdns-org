---
title: CSP script-src 추가 — Google Tag Manager 허용
status: ✅ done
---

## 문제

Firebase Analytics SDK가 `https://www.googletagmanager.com/gtag/js`를 동적으로 로드.
`script-src`에 해당 도메인이 없어 차단됨.

## 변경 내용

### `webapp/src/middleware.ts`
script-src 디렉티브에 추가:
- `https://www.googletagmanager.com` — gtag.js 스크립트 로드
