---
title: Firebase Analytics 연동
status: ✅ done
---

## 변경 범위

### 패키지
- `pnpm add firebase`

### 환경변수 (.env.local에 추가 필요)
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
```

### `src/lib/firebase.ts`
- Firebase app 초기화 (싱글턴)
- `getAnalytics` — 브라우저 환경에서만 호출 (SSR 안전 처리)

### `src/components/firebase-analytics.tsx`
- `'use client'` — Analytics는 브라우저 전용
- `usePathname` + `useEffect` 로 Next.js 라우트 변경 시 `page_view` 이벤트 전송
- `layout.tsx`에 추가

## 비고
- Analytics SDK는 브라우저 환경 확인 없이 import하면 SSR에서 오류 발생
- `NEXT_PUBLIC_MEASUREMENT_ID` 없으면 초기화 건너뜀
