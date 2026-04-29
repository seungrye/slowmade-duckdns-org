# Firebase Auth 기반 Presence 인증 전환

## 배경

기존 presenceToken(랜덤 hex + QR 코드) 방식을 제거하고
Firebase Auth(Google Sign-In)으로 통일한다.
웹과 동일한 Google 계정을 사용하므로 별도 토큰 관리 불필요.

## 인증 흐름 변경

```
Before: Android → QR 스캔 → presenceToken 저장 → Bearer <token>
After : Android → Google Sign-In(Firebase Auth) → ID token → Bearer <id_token>
         서버: Firebase REST API로 ID token 검증 → 이메일 확인 → User DB 조회
```

## 변경 파일

### webapp/
- `src/lib/firebase-verify-token.ts` (신규) — Firebase Auth REST API로 ID token → email 변환
- `src/lib/firebase-verify-token.test.ts` (신규) — 유효/무효/네트워크오류 케이스 테스트
- `src/app/api/presence/route.tsx` — POST 인증: presenceToken → Firebase ID token
- `src/models/user.tsx` — `presenceToken` 필드 제거
- `src/app/dashboard/settings/page.tsx` — `PresenceTokenSection` / QR 코드 UI 제거
- `src/app/api/user/presence-token/route.tsx` (삭제)
- `src/app/api/user/presence-token/route.test.ts` (삭제)

### android/
- `app/build.gradle.kts` — ML Kit/CameraX 제거, Firebase Auth + Google Sign-In + coroutines-play-services 추가
- `app/src/main/java/.../AuthManager.kt` (신규) — Firebase Auth ID token 조회 헬퍼
- `app/src/main/java/.../PresenceApi.kt` — sendEvent suspend 변환, ID token Bearer 전송
- `app/src/main/java/.../PresenceService.kt` — TokenStore.getToken() 제거
- `app/src/main/java/.../TokenStore.kt` — token 관련 메서드 제거 (SSID/lastEvent만 유지)
- `app/src/main/java/.../SetupFragment.kt` — QR 스캔 → Google Sign-In UI
- `app/src/main/java/.../MainActivity.kt` — CAMERA 권한 제거
- `app/src/main/res/layout/fragment_setup.xml` — 카메라 뷰 → Google Sign-In 버튼
- `app/src/test/.../AuthManagerTest.kt` (신규)

## 주의사항
- `google-services.json`은 Firebase 콘솔에서 직접 다운로드해 `android/app/` 에 넣어야 함
- Firebase 콘솔에서 Google Sign-In 인증 공급자 활성화 필요
- `strings.xml`에 `default_web_client_id` 자동 생성됨 (google-services.json 빌드 시)
