# Item 카탈로그 다중 선택 삭제  ✅

Item 카탈로그(`/quests/items`)에서 한 번에 하나씩만 삭제할 수 있어 여러 개를
정리하기 번거롭다. 체크박스로 여러 item 을 선택해 한 번에 삭제하는 기능을
추가한다.

## 배경 / 문제

`page.tsx` 의 각 행에는 단일 `삭제` 버튼만 있고 `handleDelete(id)` 가
`confirm` 후 `DELETE /api/quests/items/[id]` 를 호출한다. N개를 지우려면 N번
반복해야 한다.

## 동작 명세

### 벌크 삭제 API (`POST /api/quests/items/bulk-delete`)

- [x] body `{ ids: string[] }` 를 받는다
- [x] `ids` 가 배열이 아니거나 비어있으면 `400`
- [x] 대상 item 들의 `_id` 를 조회해 `ItemRevision` 을 cascade 삭제
  (`itemId: { $in: [...] }`)
- [x] `Item.deleteMany({ id: { $in: ids } })` 로 일괄 삭제
- [x] `{ deleted: <삭제된 개수> }` 반환 (apiSuccess)

### 카탈로그 UI (`src/app/quests/items/page.tsx`)

- [x] 각 item 행에 선택 체크박스 추가
- [x] 목록 상단에 "전체 선택"(현재 보이는 항목 기준) 체크박스 — 일부만
  선택 시 indeterminate 표시
- [x] "선택 삭제 (N)" 버튼 — 선택 0개면 disabled, 빨강 스타일
- [x] 클릭 시 `confirm` → `POST /api/quests/items/bulk-delete` →
  선택 초기화 + 목록 재로드
- [x] 재로드(`load()`) 시 선택 상태 초기화 (stale 선택 방지)
- [x] kind 필터로 보이는 항목만 "전체 선택" 대상

## 영향 파일

- `src/app/api/quests/items/bulk-delete/route.tsx` (신규)
- `src/app/api/quests/items/bulk-delete/route.test.ts` (신규)
- `src/app/quests/items/page.tsx`
- `src/app/quests/items/page.test.tsx`

## 검증 방법

- `pnpm vitest run` 전체 통과
- 카탈로그에서 여러 item 체크 → "선택 삭제" → 한 번에 삭제 + 목록 갱신 확인
