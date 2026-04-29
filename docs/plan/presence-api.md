---
title: 재실 감지 API + 차트 페이지
status: plan
---

## 개요

Android 앱이 집 Wi-Fi 연결/해제 시 서버에 이벤트를 전송.
서버는 이를 MongoDB에 저장하고, 사이트에서 누적 차트로 표시.

## 변경 내용

### `src/models/presence.tsx` (신규)
- event: 'enter' | 'exit'
- ssid: string
- timestamp: Date (서버 수신 시각)

### `src/app/api/presence/route.tsx` (신규)
- POST: 이벤트 저장 (Bearer API Key 인증)
- GET: 이벤트 목록 조회 (days 쿼리 파라미터)

### `src/app/presence/page.tsx` (신규)
- 일별 재실 시간 바 차트 (Recharts)
- 최근 입/출 이벤트 목록

### `.env.local.example`
- PRESENCE_API_KEY 추가

### `pnpm add recharts`

## API 명세

### POST /api/presence
```
Authorization: Bearer <PRESENCE_API_KEY>
Content-Type: application/json

{ "event": "enter" | "exit", "ssid": "HomeSSID" }

→ 201 { "ok": true, "id": "..." }
→ 401 { "error": "Unauthorized" }
→ 400 { "error": "..." }
```

### GET /api/presence?days=30
```
→ 200 {
    "events": [{ "_id", "event", "ssid", "timestamp" }, ...],
    "dailySummary": [{ "date": "2026-04-30", "minutes": 480 }, ...]
  }
```

## dailySummary 계산 방식
- enter/exit 쌍을 매칭해 체류 시간(분) 합산
- exit 없이 enter만 있으면 현재까지 진행 중으로 계산
