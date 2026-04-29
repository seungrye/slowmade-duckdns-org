---
title: Firebase Performance Monitoring 연동
status: ✅ done
---

## 변경 내용

### `src/lib/firebase.ts`
- `getFirebasePerformance()` 함수 추가
- 브라우저 환경 확인 후 싱글턴으로 초기화

### `src/components/firebase-performance.tsx` (신규)
- `'use client'` 컴포넌트
- 마운트 시 Performance 초기화 (자동 수집 시작)

### `src/app/layout.tsx`
- `<FirebasePerformance />` 추가

### `src/middleware.ts`
- `connect-src`에 Performance 전송 도메인 추가
  - `https://firebaselogging.googleapis.com`
  - `https://firebaselogging-pa.googleapis.com`

## 자동 수집 항목
- 페이지 로드 시간 (FCP, FID 등)
- 네트워크 요청 타이밍 (fetch, XHR)
