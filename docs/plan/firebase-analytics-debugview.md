---
title: Firebase Analytics DebugView 활성화 + 이벤트 보강
status: plan
---

## 변경 내용

### `src/lib/firebase.ts`
- `getAnalytics` → `initializeAnalytics`로 교체
- 개발 환경(`NODE_ENV !== 'production'`)에서 `debug_mode: true` 자동 활성화
- 싱글턴 Promise 패턴으로 중복 초기화 방지

### `src/components/firebase-analytics.tsx`
- `page_view` 이벤트에 `page_title`, `page_location` 추가
  - `page_title`: `document.title`
  - `page_location`: `window.location.href`

## DebugView 확인 방법
- 개발 환경: 자동으로 debug_mode 활성화
- 프로덕션: URL에 `?debug_mode=1` 파라미터 추가
- Firebase Console → Analytics → DebugView
