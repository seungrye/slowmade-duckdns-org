# 개발 계획 — 잔여 작업

완료 항목은 git 히스토리로 확인. 여기에는 **미완료 항목만** 기록.

---

## 보안

상세 현황: [security.md](security.md)

| 항목 | 내용 | 우선순위 |
|------|------|----------|
| M-1 | 익명 댓글 IP Rate Limiting | Medium |
| L-3 | NextAuth cookies `sameSite: 'lax'` 명시 | Low |
| H-9 2단계 | `style-src 'unsafe-inline'` 제거 (Tiptap 인라인 스타일 CSS 전환 선행) | Low |
| C-1 | 시크릿 로테이션 (.env.local) — 사용자 직접 수행 | Critical |

---

## 기능 개발

상세: [features.md](features.md)

| 항목 | 내용 |
|------|------|
| #2 | 작성 페이지 임시 저장 (localStorage draft) |
| #3 | 작성글 revision UI (diff 비교·복원) |
| #4 | 작성/보기 화면 전체 높이 채우기 |
| #5 | 태그 검색 결과 항목 전체 클릭 |
| #6 | 작성글 카드 전체 클릭 영역 확장 |
| #7 | 작성순/갱신순 정렬 추가 |
| S9 | URL slug 기반 변경 (대형 작업) |

---

## 코드 품질

| 항목 | 내용 |
|------|------|
| D3 | `src/lib/api-client.ts` — fetch 클라이언트 통일 |
| T1 잔여 | 업적 시스템 / API 라우트 추가 테스트 |
