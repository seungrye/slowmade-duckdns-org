---
title: 재실 감지 토큰 QR 코드 연동
status: ✅ done
---

## 변경 내용

### `pnpm add qrcode.react`

### `src/app/dashboard/settings/page.tsx`
- 텍스트 토큰 표시 → QR 코드 이미지로 교체
- QR 코드 값: `presence://setup?token=TOKEN` (deep link 형식)
- 토큰 없으면 "토큰 생성" 버튼만 표시

### docs/android-presence-app.md
- SetupFragment 카메라 스캔 방식으로 교체
- ML Kit Barcode Scanning 의존성 추가
- 카메라 권한 추가
- deep link intent filter 추가
