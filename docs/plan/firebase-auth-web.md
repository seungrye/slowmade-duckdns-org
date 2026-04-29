# Firebase Auth 웹 통합 (미래 작업)

Firebase Auth 콘솔에서 웹·Android 사용자를 통합 관리하기 위해
웹 로그인도 NextAuth → Firebase Auth로 전환한다.

## 현재 구조

```
웹    : NextAuth → Google OAuth → MongoDB 세션  (Firebase Auth 미관여)
Android: Firebase signInWithCredential → Firebase ID token → /api/presence
```

## 목표 구조

```
웹    : Firebase signInWithPopup → Firebase ID token → 자체 세션 쿠키
Android: Firebase signInWithCredential → Firebase ID token → /api/presence
공통  : 서버에서 verifyFirebaseIdToken(accounts:lookup) 으로 검증
        MongoDB User 컬렉션은 앱 데이터 저장소로 유지
```

## 할 일

### 1. 의존성 추가
- `firebase` 패키지는 이미 설치됨 (Analytics용)
- `firebase-admin` SDK 추가 — 서버에서 ID token 검증 또는 세션 쿠키 생성 시 필요

### 2. 웹 로그인 전환
- `signInWithPopup(auth, new GoogleAuthProvider())` 로 Firebase 로그인
- 로그인 성공 후 `user.getIdToken()` 으로 ID token 취득
- 서버에 ID token 전달 → 세션 쿠키 발급 API 구현

### 3. 서버 세션 관리
- `/api/auth/session` (신규) — Firebase ID token 검증 후 HttpOnly 세션 쿠키 발급
- `middleware.ts` — 세션 쿠키로 인증 상태 확인 (현재 NextAuth `auth()` 대체)
- 기존 NextAuth `auth()` 호출을 전부 세션 쿠키 검증으로 교체

### 4. NextAuth 제거
- `next-auth` 패키지 제거
- `src/auth.ts`, `src/app/api/auth/[...nextauth]/` 제거
- MongoDB `sessions`, `accounts` 컬렉션 제거
- `useSession()` → Firebase `onAuthStateChanged` 또는 자체 훅으로 교체

### 5. MongoDB User 컬렉션 유지
- `achievements`, `points`, `likedPosts`, `settings` 등 앱 고유 데이터는 MongoDB 유지
- Firebase Auth UID 또는 email을 키로 User 문서 참조

## 주의사항
- Firebase Admin SDK 서비스 계정 키 환경변수 필요 (`FIREBASE_SERVICE_ACCOUNT_KEY`)
- 세션 쿠키 만료 처리, 갱신 로직 직접 구현 필요 (NextAuth가 자동으로 하던 것)
- `useSession()` 사용하는 클라이언트 컴포넌트 전수 교체 필요
- 작업 규모가 크므로 기능 단위로 분리하여 진행 권장
