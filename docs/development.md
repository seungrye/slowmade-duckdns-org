# 개발 가이드

## 명령어

```bash
pnpm dev          # 개발 서버 (포트 3010, Turbopack)
pnpm build        # 프로덕션 빌드
pnpm lint         # ESLint
pnpm test         # 전체 테스트 1회 실행 (Vitest)
pnpm test:watch   # Vitest watch 모드

# 단일 테스트 파일 실행
npx vitest run src/lib/__tests__/sort.test.ts
```

## 작업 규칙

- 코드 변경 시 해당 변경을 커버하는 테스트를 추가하거나 업데이트한다.
- 작업 완료 전 테스트 스위트를 실행해 통과를 확인한다.
- `src/lib/*` 로직은 단위 테스트, API 동작은 API 수준 테스트를 선호한다.
- 아키텍처에 영향을 주는 변경은 `docs/` 내 관련 문서를 업데이트한다.
