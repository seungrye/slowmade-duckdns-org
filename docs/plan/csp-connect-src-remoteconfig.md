---
title: CSP connect-src 추가 — Firebase Remote Config 허용
status: plan
---

## 문제

Firebase Performance SDK가 내부적으로 샘플링 설정을 Remote Config에서 받아옴.
`https://firebaseremoteconfig.googleapis.com`이 connect-src에 없어 차단됨.

## 변경 내용

### `src/middleware.ts`
connect-src에 추가:
- `https://firebaseremoteconfig.googleapis.com` — Performance SDK 설정 조회
