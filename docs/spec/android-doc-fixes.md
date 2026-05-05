---
title: Android 앱 문서 버그/누락 수정
status: plan
---

## 수정 항목

- MainViewModel.kt 코드 추가 (완전히 누락)
- WifiManager.connectionInfo deprecated → onCapabilitiesChanged + WifiInfo
- lastEventTime/lastEventType @Volatile 추가 (스레드 안전)
- SetupFragment onRequestPermissionsResult 추가
- MainActivity 권한 요청 코드 통일 (카메라 포함)
- 의존성에 fragment-ktx, appcompat, material 추가
- OkHttp + MPAndroidChart ProGuard 룰 추가
- SetupViewModel 제거 (QR 방식에선 미사용)
- PresenceApi.fetchSummary 스텁 제거 + 해결책 명시
- DailyEntry를 별도 파일로 분리
