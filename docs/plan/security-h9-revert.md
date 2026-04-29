---
title: H-9 script-src unsafe-inline 복원
status: plan
---

## 배경

nonce 기반 CSP 전환 후 Next.js App Router가 자체 주입하는
RSC 스트리밍 스크립트(`(self.__next_f=...)`)에 nonce를 자동으로
적용하지 않아 런타임 CSP 위반 발생.

동적 RSC 데이터 청크는 요청마다 내용이 다르므로 hash 방식도 불가.
Next.js 15 App Router의 구조적 한계로 판단.

## 변경 내용

### `src/middleware.ts`
- `script-src 'nonce-${nonce}'` → `'unsafe-inline'` 복원
- nonce 생성 코드 및 request header 설정 제거

### `src/middleware.test.ts`
- nonce 관련 테스트 → `unsafe-inline` 검증으로 교체

### `docs/plan/security.md`
- H-9 상태를 "한계로 인해 보류" 로 업데이트
