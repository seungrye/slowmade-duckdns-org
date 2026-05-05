---
# Firebase 설정 누락 시 graceful ignore

## 목적

환경 변수 미설정 상태에서 서버를 실행할 때 `FirebaseError`로 앱이 중단되지 않도록 방어 처리.

## 변경 파일

- `webapp/src/lib/firebase.ts`

## 작업 목록

- ✅ `projectId` / `appId` 누락 여부 사전 체크 후 `console.warn` 출력
- ✅ 설정 누락 시 `app = null`로 두고 `getFirebasePerformance` / `getFirebaseAnalytics` 에서 조기 반환
- ✅ `firebase.ts` 단위 테스트 추가
