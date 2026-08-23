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

# Web Adventure 콘텐츠 lint
pnpm lint:web-adventure              # 본문 길이/문단 lint (#248)
MONGO_URI=... pnpm lint:web-adventure:structure   # 그래프 구조 lint (#271)

# Playwright e2e (#277)
pnpm e2e:install                                  # chromium 다운로드 (1회)
PLAYWRIGHT_BASE_URL=http://localhost:3010 pnpm e2e
```

## 작업 규칙

- **테스트를 먼저 쓴다.** 구현 전에 실패하는 테스트를 쓰고 **빨강을 눈으로 확인**한 뒤
  구현한다. 통과하는 테스트를 나중에 덧붙이면 그 테스트가 무엇을 잡는지 알 수 없다 —
  실패하는 것을 본 적이 없기 때문이다.
- **빨강을 봤다는 증거를 남긴다.** PR 본문에 실패했을 때의 테스트 출력을 붙인다.
  TDD 는 "했다"고 말하기 쉽고 확인하기는 어렵다. 증거가 없으면 검수에서 반려한다.
- 작업 완료 전 테스트 스위트를 실행해 통과를 확인한다.
- `webapp/src/lib/*` 로직은 단위 테스트, API 동작은 API 수준 테스트를 선호한다.
- **목(mock)으로 확인할 수 없는 것은 실제로 재본다.** DB 질의의 의미, 브라우저 동작,
  권한 규칙처럼 **틀려도 조용히 지나가는** 것들이 있다. 대조군을 두고 전후를 비교한다.
  (실제로 그렇게 새어 나간 것들: 배열 필드의 `$not` 의미, 셸 변수가 든 명령의 권한 거부,
  게인 노드가 없어 음량 조절이 무효였던 것.)
- 아키텍처에 영향을 주는 변경은 `docs/` 내 관련 문서를 업데이트한다.
