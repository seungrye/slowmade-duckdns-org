# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Dev server on port 3010 (Turbopack)
npm run build      # Production build
npm run lint       # ESLint
npm run test       # Run all tests once (Vitest)
npm run test:watch # Vitest watch mode

# Run a single test file
npx vitest run src/lib/__tests__/sort.test.ts
```

## Workflow Rules

- 코드 변경 시 항상 해당 변경을 커버하는 테스트를 추가하거나 업데이트한다.
- 작업 완료 전 테스트 스위트를 실행해 통과를 확인한다.
- `src/lib/*` 로직은 단위 테스트, API 동작은 API 수준 테스트를 선호한다.
- 아키텍처에 영향을 주는 변경은 `docs/` 내 관련 문서를 업데이트한다.

## Documentation

- [Architecture](docs/architecture.md) — 시스템 구조, 컴포넌트 다이어그램, API 엔드포인트, 환경 변수
- [System Design (SDS)](docs/SDS.md) — DB 스키마, 데이터 흐름, 인증 설계
- [Requirements (SRS)](docs/SRS.md) — 기능 요구사항
- [Plan](docs/plan.md) — 개발 계획 및 우선순위
