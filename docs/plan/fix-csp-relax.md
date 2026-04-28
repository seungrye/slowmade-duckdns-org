---
issue: bugfix
title: CSP 완화 — nonce/strict-dynamic 제거, unsafe-inline 허용
status: plan
---

## 문제

앱이 CSP를 고려하지 않고 설계된 상태에서 미들웨어가 활성화되어
인라인 스타일·스크립트가 전면 차단됨.
Tiptap, KaTeX 등 서드파티 라이브러리도 인라인 스타일을 사용하므로
nonce 기반 strict CSP를 현 시점에 유지하는 건 비현실적.

## 수정 내용

`src/middleware.ts` CSP 완화:
- `script-src`: nonce + strict-dynamic 제거 → `'self' 'unsafe-inline'`
- `style-src`: nonce 제거 → `'self' 'unsafe-inline'`
- nonce 생성 코드 전체 제거 (불필요)

## 향후 과제 (security.md에 추가)

앱을 CSP 친화적으로 설계한 뒤 static CSP 적용:
- 인라인 스타일 → CSS 클래스 전환
- 인라인 스크립트 제거
- script-src에 hash 기반 허용 목록 적용
