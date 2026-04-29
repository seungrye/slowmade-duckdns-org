---
title: 모노레포 구조 개편 (webapp/ + android/)
status: ✅ done
---

## 목표

루트에 흩어진 Next.js 코드를 `webapp/` 이하로 이동하고 `android/` 디렉터리를 신설해
하나의 레포에서 웹앱과 Android 앱을 함께 관리한다.

## 현재 루트 파일 전수 조사

```
# git mv 대상 (webapp/으로 이동)
src/
public/
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
next.config.ts
tsconfig.json
postcss.config.mjs        # tailwind.config.ts 는 없음 — postcss에 통합
vitest.config.ts
vitest.d.ts
eslint.config.mjs
components.json
next-env.d.ts
.env.local.example
copilot-instructions.md
.gitignore                # webapp/.gitignore 로 이동 (Next.js 전용)

# 루트 유지 (이동 불필요)
.vscode/                  # 워크스페이스 전체 적용 — 루트에 두고 vitest.rootConfig 설정 추가

# gitignore 대상 — 이동 불필요 (재생성/재설치)
node_modules/
.next/
tsconfig.tsbuildinfo

# 루트 유지
.git/
.claude/                  # Claude Code 훅 — working dir 기준
.claudeignore             # 루트 유지하되 경로 패턴 업데이트 필요
CLAUDE.md
README.md
docs/
scripts/                  # 빈 디렉터리 — git mv 대신 mkdir로 재생성
```

## 최종 디렉터리 구조

```
site/
├── webapp/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── pnpm-workspace.yaml
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── postcss.config.mjs
│   ├── vitest.config.ts
│   ├── vitest.d.ts
│   ├── eslint.config.mjs
│   ├── components.json
│   ├── next-env.d.ts
│   ├── .env.local.example
│   ├── .gitignore
│   └── copilot-instructions.md
├── android/
├── docs/
├── .claude/
├── .claudeignore          ← 경로 패턴 업데이트
├── .vscode/               ← 루트 유지 (vitest.rootConfig 설정 추가)
├── CLAUDE.md
├── README.md
└── .gitignore             ← Android 아티팩트 전용으로 교체
```

## 단계별 작업

### 0단계: 사전 확인

```bash
pnpm test      # 전체 통과 확인
git status     # clean 확인
```

### 1단계: git mv로 파일 이동

`git mv`를 사용해야 git 이력이 보존된다.

```bash
mkdir webapp

git mv src                  webapp/src
git mv public               webapp/public
git mv package.json         webapp/package.json
git mv pnpm-lock.yaml       webapp/pnpm-lock.yaml
git mv pnpm-workspace.yaml  webapp/pnpm-workspace.yaml
git mv next.config.ts       webapp/next.config.ts
git mv tsconfig.json        webapp/tsconfig.json
git mv postcss.config.mjs   webapp/postcss.config.mjs
git mv vitest.config.ts     webapp/vitest.config.ts
git mv vitest.d.ts          webapp/vitest.d.ts
git mv eslint.config.mjs    webapp/eslint.config.mjs
git mv components.json      webapp/components.json
git mv next-env.d.ts        webapp/next-env.d.ts
git mv .env.local.example   webapp/.env.local.example
git mv copilot-instructions.md webapp/copilot-instructions.md
git mv .gitignore           webapp/.gitignore
```

이동하지 않는 항목:
- `node_modules/` — gitignore 대상, 이동 후 `pnpm install` 재실행
- `.next/` — gitignore 대상, 자동 재생성
- `tsconfig.tsbuildinfo` — gitignore 대상, 자동 재생성
- `scripts/` — 빈 디렉터리라 git mv 불필요, `webapp/scripts/` 직접 생성

```bash
mkdir webapp/scripts
```

### 2단계: 루트 .gitignore 신규 작성

`webapp/.gitignore`로 기존 Next.js 항목이 이동했으므로, 루트에는 Android 아티팩트와 공통 항목만:

```gitignore
# Android
.gradle/
android/.gradle/
android/build/
android/app/build/
android/local.properties
*.apk
*.aab
*.keystore
!debug.keystore

# 공통
.DS_Store
```

### 3단계: .claudeignore 경로 패턴 업데이트

현재 `.env.local` 패턴은 루트 기준이라 `webapp/.env.local` 에 매칭 안됨.
glob 패턴으로 교체:

```
# 시크릿 / 환경변수 (webapp/ 이하 포함)
**/.env
**/.env.local
**/.env.*.local
**/.env.production
**/.env.production.local

# 인증서 / 키
*.pem
*.key
*.p12
*.pfx

# 기타 민감 파일
secrets/
credentials/
```

### 4단계: 훅 경로 수정

`.claude/hooks/check-src-edit.sh`
- `^$REPO/src/` → `^$REPO/webapp/src/`

`.claude/hooks/check-commit-sequence.sh`
- `grep '^src/'` → `grep '^webapp/src/'` (3곳)
- `grep '^docs/plan/'` 는 그대로 유지

### 5단계: .vscode/settings.json에 vitest.rootConfig 추가

`.vscode/`는 루트에 유지하되, Vitest 익스텐션이 `webapp/vitest.config.ts`를 찾을 수 있도록 경로 설정 추가:

```json
{
    "chat.tools.terminal.autoApprove": { "pnpm": true },
    "vitest.enable": true,
    "vitest.rootConfig": "webapp/vitest.config.ts"
}
```

### 6단계: docs/ 내부 src/ 경로 참조 일괄 업데이트

다음 파일에서 `src/` → `webapp/src/` 치환 (grep 결과로 확인된 파일 전체):

- `docs/architecture.md` — `src/app/api/*`, `src/lib/*` 등
- `docs/development.md` — `src/lib/__tests__/sort.test.ts`, `src/lib/*`
- `docs/seo-ai-crawling.md` — `src/app/...` 다수
- `docs/analytics.md` — `src/components/...`
- `docs/SDS.md` — `src/app/...`, `src/lib/...`, `src/components/...` 다수
- `docs/code-quality.md` — `src/lib/...`, `src/app/api/...` 다수
- `docs/hooks.md` — `src/` 편집 설명 (`webapp/src/`로 변경)

### 7단계: docs/development.md 명령어 수정

| 변경 전 | 변경 후 |
|---------|---------|
| `pnpm dev` | `cd webapp && pnpm dev` |
| `pnpm build` | `cd webapp && pnpm build` |
| `pnpm lint` | `cd webapp && pnpm lint` |
| `pnpm test` | `cd webapp && pnpm test` |
| `pnpm test:watch` | `cd webapp && pnpm test:watch` |
| `npx vitest run src/...` | `cd webapp && npx vitest run webapp/src/...` |

### 8단계: android/ 디렉터리 신설

```bash
mkdir android
touch android/.gitkeep
```

### 9단계: 동작 확인 후 커밋

```bash
cd webapp
pnpm install      # node_modules 재설치
pnpm test         # 테스트 전부 통과 확인
cd ..
git add -A
git status        # 확인 후
# impl: 커밋
```

## 사용자 수동 작업 (커밋 후)

gitignore 대상이라 `git mv` 불가 — 직접 이동:

```bash
mv .env.local webapp/.env.local
cd webapp && pnpm install
cd webapp && pnpm dev     # 정상 동작 최종 확인
```

## 주의사항

- `git mv` 사용 필수 — `cp + rm`은 이력 단절
- 훅 수정을 먼저 하고 git mv 진행 (훅이 `^src/` 체크하므로)
  - 단, 훅은 Edit 도구 호출 시 체크 → Bash의 `git mv`는 훅 미적용
  - 실제로는 순서 무관하게 Bash로 git mv 후 훅 파일 수정 가능
- `.gitignore` 앞 `/`는 해당 파일 위치 기준이므로 `webapp/.gitignore`로 이동 후에도 동일하게 동작
- `scripts/`는 빈 디렉터리라 git이 추적하지 않음 → `webapp/scripts/.gitkeep` 필요 또는 그냥 생략
