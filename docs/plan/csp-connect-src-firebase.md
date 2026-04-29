---
title: CSP connect-src 추가 — Firebase Analytics 허용
status: ✅ done
---

## 문제

`connect-src` 미설정으로 `default-src 'self'` 폴백 적용.
Firebase Analytics SDK가 아래 도메인에 연결 시도 → 차단됨.

## 변경 내용

### `src/middleware.ts`
connect-src 디렉티브 추가:
- `https://firebase.googleapis.com` — Firebase 앱 설정 조회
- `https://firebaseinstallations.googleapis.com` — Firebase 설치 ID
- `https://www.google-analytics.com` — Analytics 이벤트 전송
- `https://analytics.google.com` — Analytics
