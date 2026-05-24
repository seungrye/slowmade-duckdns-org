# Villager 색상 입력 개선 ✅

villager 생성/편집 시 색상을 r/g/b 숫자 3개로 따로 입력하는 대신 컬러
피커로 고르게 하고, 생성 시 기본 색상은 랜덤으로 채운다.

## 배경 / 문제

- 색상이 `[r, g, b]` (각 0.0~1.0). 현재 폼은 number input 3개라 번거롭다.
- 생성 폼 기본 색상이 흰색 고정 → 새 villager 가 다 흰색.

## 동작 명세

- [x] `randomColor()` — 0~1 범위 RGB 튜플 랜덤 생성
- [x] "+ 새 villager" 클릭 시 생성 폼 색상을 랜덤으로 초기화
- [x] 색상 입력을 `<input type="color">` (hex) 로 교체
  - [x] `rgb01ToHex([r,g,b])` / `hexToRgb01("#rrggbb")` 변환 (0~1 ↔ 0~255 hex)
  - [x] 현재 0~1 값을 작은 readout 으로 함께 표시 (RON 은 0~1 사용)
- [x] 편집 폼도 동일 컬러 피커 사용

## 영향 파일

- `src/app/quests/villagers/page.tsx`

## 검증 방법

- "+ 새 villager" → 색상이 매번 랜덤, 컬러 피커로 변경 가능
- `pnpm vitest run` 전체 통과
