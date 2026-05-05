# Android Firebase Auth 설정 (다음 단계)

## 전제 조건

Firebase Auth 일원화(`firebase-auth-unified.md`) 웹 구현 완료 후 진행.

## Firebase Console 설정 (선행 필수)

1. Firebase Console → Authentication → Sign-in method → Google 활성화
2. Android 앱 SHA-1 fingerprint 등록:
   ```
   cd android && ./gradlew signingReport
   # debug SHA1 복사 → Firebase Console → 앱 설정 → SHA 인증서 지문 추가
   ```
3. `google-services.json` 다운로드 → `android/app/` 에 배치

## Android 코드 변경

### build.gradle.kts (app)
현재 이미 firebase-bom, firebase-auth-ktx, play-services-auth, coroutines-play-services 추가됨.
google-services 플러그인도 있음. 변경 불필요.

### AuthManager.kt
`FirebaseAuth.getInstance().currentUser?.getIdToken(false).await()` 로 Firebase ID token 취득.
현재 구현 유지.

### SetupFragment.kt
`GoogleSignInAccount` → `FirebaseAuth.signInWithCredential(GoogleAuthProvider.getCredential(idToken, null)).await()`
Firebase 사용자 생성 후 ID token 취득.

## 주의사항
- `google-services.json` 없으면 빌드 실패
- Firebase Console Google Sign-In 미활성화 시 `signInWithCredential` 실패
- SHA-1 미등록 시 Google Sign-In 자체가 실패할 수 있음
