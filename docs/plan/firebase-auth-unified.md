# Firebase Auth 일원화

## 목적

Google tokeninfo 직접 검증 방식에서 Firebase Auth REST API 검증으로 되돌린다.
Firebase Auth를 사용하면 Google 외 GitHub, Apple 등 다른 provider 추가 시 서버 코드 변경 없이 확장 가능.

## 인증 흐름

```
Android : Google Sign-In → Firebase Auth → Firebase ID token → Bearer <id_token>
Server  : POST identitytoolkit.googleapis.com/v1/accounts:lookup?key=FIREBASE_API_KEY
          → users[0].email 추출 → User DB 조회
```

## 웹 변경 사항

- `src/lib/firebase-verify-token.ts` — `verifyGoogleIdToken` → `verifyFirebaseIdToken` 복원
  - `NEXT_PUBLIC_FIREBASE_API_KEY` 환경변수 사용 (이미 .env.local 에 설정됨)
  - Firebase `accounts:lookup` REST API 호출
- `src/app/api/presence/route.tsx` — import/call 복원

테스트(`firebase-verify-token.test.ts`)는 이미 Firebase Auth 기준으로 작성되어 있음 — 변경 불필요.

## Android 할 일 (다음 단계)

docs/plan/android-firebase-auth-setup.md 참고
