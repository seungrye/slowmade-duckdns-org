---
title: 재실 감지 다중 사용자 지원 + 빌드 오류 수정
status: ✅ done
---

## 빌드 오류 수정
- `webapp/src/app/api/presence/route.tsx`: `NextResponse` unused import 제거

## 다중 사용자 지원 변경

### `webapp/src/models/user.tsx`
- `presenceToken?: String` 필드 추가 (랜덤 hex, 앱 인증용)

### `webapp/src/models/presence.tsx`
- `userEmail: String` 필드 추가 (이벤트 소유자)

### `webapp/src/app/api/presence/route.tsx`
- POST: `Authorization: Bearer <presenceToken>` → User 컬렉션에서 조회 → userEmail 저장
  - 기존 공용 PRESENCE_API_KEY 방식 제거
- GET: NextAuth 세션 필요 → 본인 이벤트만 반환

### `webapp/src/app/api/user/presence-token/route.tsx` (신규)
- GET: 로그인 사용자의 presenceToken 반환 (없으면 생성)

### `webapp/src/app/dashboard/settings/page.tsx`
- presenceToken 표시 + 복사 버튼 섹션 추가

### `webapp/src/app/presence/page.tsx`
- NextAuth 세션 필요 → 본인 데이터만 표시
