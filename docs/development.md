# 개발 가이드

## 환경 요구사항

| 도구 | 버전 |
|------|------|
| Node.js | **20 (LTS Iron)** — `nvm use lts/iron` |
| pnpm | 최신 (corepack 또는 `npm i -g pnpm`) |

> Vitest 4.x는 Node 20+ 필수입니다. Node 18에서는 `styleText` export 오류로 실행되지 않습니다.
> 훅(`check-commit-sequence.sh`)은 커밋 시 자동으로 `nvm use lts/iron`으로 전환합니다.

## 명령어

```bash
cd webapp

pnpm dev          # 개발 서버 (포트 3010, Turbopack)
pnpm build        # 프로덕션 빌드
pnpm lint         # ESLint
pnpm test         # 전체 테스트 1회 실행 (Vitest)
pnpm test:watch   # Vitest watch 모드

# 단일 테스트 파일 실행 (webapp/ 디렉터리 안에서 실행)
pnpm vitest run src/lib/__tests__/sort.test.ts
```

## 작업 규칙

- 코드 변경 시 해당 변경을 커버하는 테스트를 추가하거나 업데이트한다.
- 작업 완료 전 테스트 스위트를 실행해 통과를 확인한다.
- `webapp/src/lib/*` 로직은 단위 테스트, API 동작은 API 수준 테스트를 선호한다.
- 아키텍처에 영향을 주는 변경은 `docs/` 내 관련 문서를 업데이트한다.
