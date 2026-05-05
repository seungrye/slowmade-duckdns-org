# 개발 스펙 — 잔여 작업

완료 항목은 git 히스토리로 확인. 여기에는 **미완료 항목만** 기록.

---

## 🔄 진행중

| 작업 | 상태 | 상세 |
|------|------|------|
| Android Firebase Auth 설정 | 코드 완료, Firebase Console 설정 대기 | [android-firebase-auth-setup.md](android-firebase-auth-setup.md) |

---

## 보안

상세 현황: [security.md](security.md)

| 항목 | 내용 | 우선순위 |
|------|------|----------|
| M-1 | 익명 댓글 IP Rate Limiting | Medium |
| L-3 | NextAuth cookies `sameSite: 'lax'` 명시 | Low |
| H-9 | `unsafe-inline` 제거 — Next.js RSC 스크립트 nonce 미적용 + Tiptap 한계로 보류 | Low |
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
| D3 | `webapp/src/lib/api-client.ts` — fetch 클라이언트 통일 |
| T1 잔여 | 업적 시스템 / API 라우트 추가 테스트 |

---

## Firebase Auth 웹 통합

상세: [firebase-auth-web.md](firebase-auth-web.md)

NextAuth → Firebase Auth 전환으로 웹·Android 사용자를 Firebase 콘솔에서 통합 관리.
작업 규모가 크므로 별도 착수 시점 결정 필요.

---

## Android

상세: [android-doc-fixes.md](android-doc-fixes.md), [android-firebase-auth-setup.md](android-firebase-auth-setup.md)

| 항목 | 내용 |
|------|------|
| - | 문서 버그/누락 수정 (MainViewModel, WifiInfo, @Volatile 등) |
| - | Firebase Auth 설정: SHA-1 등록, Google Sign-In 활성화, google-services.json 배치 |

---

## 완료된 작업

| 작업 | 요약 |
|------|------|
| 모노레포 구조 개편 | Next.js → `webapp/`, Android → `android/` 분리 |
| Firebase Analytics 연동 | `pnpm add firebase`, page_view 이벤트, layout.tsx 추가 |
| Firebase Analytics DebugView | `initializeAnalytics` + debug_mode, page_title/location 파라미터 |
| Firebase Performance 연동 | `getFirebasePerformance()` 싱글턴, FirebasePerformance 컴포넌트 |
| Analytics scroll_depth | 25/50/75/100% 구간 이벤트, PostScrollDepth 컴포넌트 |
| CSP connect-src (Firebase Analytics) | firebase.googleapis.com 외 3개 도메인 허용 |
| CSP connect-src (Remote Config) | firebaseremoteconfig.googleapis.com 허용 |
| CSP script-src (GTM) | www.googletagmanager.com 허용 |
| H-9 unsafe-inline 복원 | Next.js RSC nonce 미적용 한계로 nonce 방식 롤백 |
| 재실 감지 API + 차트 | Presence 모델/API, Recharts 바 차트 페이지 |
| 재실 감지 다중 사용자 | presenceToken 기반 인증, 사용자별 이벤트 분리 |
| 재실 감지 QR 코드 | qrcode.react, `presence://setup?token=` deep link |
| 테마 동기화 | cookie SSR + ThemeSync(로그인 시 DB 동기화) |
| 테마 CSS 클래스 통일 | `@custom-variant dark`, `dark:` 유틸리티 `.dark` 클래스 반응 |
| presenceToken → Firebase Auth | QR/presenceToken 제거, Firebase ID token Bearer 인증으로 전환 |
| Firebase Auth 일원화 | Google tokeninfo 대신 accounts:lookup — provider 확장성 확보 |
