# Firebase Auth 제거 — Google ID token 직접 검증

## 문제
`signInWithCredential`로 Firebase Auth 사용자를 만들려면
- Firebase 콘솔에서 Google Sign-In 활성화 필요
- Android 앱 SHA-1 지문 등록 필요
→ 설정이 복잡하고, 서버는 Firebase Auth가 전혀 필요 없음

## 해결책
Google Sign-In ID token을 Firebase Auth 거치지 않고 Google tokeninfo API로 직접 검증.

```
Android: Google Sign-In → Google ID token (Bearer)
Server : GET https://oauth2.googleapis.com/tokeninfo?id_token=<token>
         → aud == WEB_CLIENT_ID 검증 + email 추출
```

## 장점
- Firebase Auth 활성화 불필요
- google-services.json 불필요 (Android에서 Firebase 의존성 완전 제거)
- 웹 클라이언트 ID 하나로 Android + Server 연동

## 변경 파일

### webapp/
- `src/lib/firebase-verify-token.ts` — Google tokeninfo API로 교체, aud 검증 추가

### android/
- `app/src/main/java/.../AuthManager.kt` — Firebase Auth 제거, Google Sign-In silentSignIn으로 토큰 갱신
- `app/src/main/java/.../SetupFragment.kt` — signInWithCredential 제거, Google account 직접 사용
- `app/build.gradle.kts` — firebase-bom, firebase-auth-ktx, google-services 플러그인 제거
- `settings.gradle.kts` — google-services 플러그인 제거

## 웹 클라이언트 ID
`718135604242-du5j0ja17ra3b63llbtjtvh5a4i3gaci.apps.googleusercontent.com`
