---
title: 모노레포 구조 개편 (webapp/ + android/)
status: plan
---

## 목표

루트에 흩어진 Next.js 코드를 `webapp/` 이하로 이동하고 `android/` 디렉터리를 신설해
하나의 레포에서 웹앱과 Android 앱을 함께 관리한다.

## 최종 디렉터리 구조

```
site/
├── webapp/                  ← Next.js 앱 (현재 루트에서 이동)
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── pnpm-workspace.yaml
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── postcss.config.mjs
│   ├── vitest.config.ts
│   ├── vitest.d.ts
│   ├── eslint.config.mjs
│   ├── components.json
│   ├── next-env.d.ts
│   ├── .env.local.example
│   ├── .gitignore           ← 루트에서 이동 (Next.js 전용 항목)
│   └── copilot-instructions.md
├── android/                 ← Android 앱 (신규)
├── docs/                    ← 공유 문서 (그대로)
├── .claude/                 ← 훅 (경로만 수정)
├── CLAUDE.md
├── README.md
└── .gitignore               ← Android 아티팩트만 남김 (신규 작성)
```

## 단계별 작업

### 0단계: 사전 확인

- `pnpm test` 전부 통과 확인
- 미커밋 변경 없음 확인 (`git status`)

### 1단계: git mv로 파일 이동

`git mv`를 사용해야 git 이력이 보존된다.

```bash
mkdir webapp

git mv src              webapp/src
git mv public           webapp/public
git mv package.json     webapp/package.json
git mv pnpm-lock.yaml   webapp/pnpm-lock.yaml
git mv pnpm-workspace.yaml webapp/pnpm-workspace.yaml
git mv next.config.ts   webapp/next.config.ts
git mv tsconfig.json    webapp/tsconfig.json
git mv tailwind.config.ts webapp/tailwind.config.ts
git mv postcss.config.mjs webapp/postcss.config.mjs
git mv vitest.config.ts webapp/vitest.config.ts
git mv vitest.d.ts      webapp/vitest.d.ts
git mv eslint.config.mjs webapp/eslint.config.mjs
git mv components.json  webapp/components.json
git mv next-env.d.ts    webapp/next-env.d.ts
git mv .env.local.example webapp/.env.local.example
git mv copilot-instructions.md webapp/copilot-instructions.md
```

이동하지 않는 항목:
- `node_modules/` — gitignore 대상, 이동 후 재설치
- `tsconfig.tsbuildinfo`, `.next/` — gitignore 대상, 자동 재생성
- `docs/`, `.claude/`, `CLAUDE.md`, `README.md` — 루트 유지

### 2단계: .gitignore 분리

**`webapp/.gitignore`** (루트에서 이동한 내용 그대로):
- Next.js, pnpm, TypeScript 빌드 아티팩트 항목 유지
- 경로 앞 `/`가 `webapp/.gitignore` 기준으로 동작하므로 그대로 사용 가능

**루트 `.gitignore`** 를 Android 전용으로 교체:
```
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

### 3단계: 훅 경로 수정

`.claude/hooks/check-src-edit.sh`
- `^$REPO/src/` → `^$REPO/webapp/src/`

`.claude/hooks/check-commit-sequence.sh`
- `grep '^src/'` → `grep '^webapp/src/'` (3곳)
- `grep '^docs/plan/'` 는 그대로

### 4단계: docs/development.md 경로 수정

```bash
# 변경 전              → 변경 후
pnpm dev              → cd webapp && pnpm dev
pnpm build            → cd webapp && pnpm build
pnpm lint             → cd webapp && pnpm lint
pnpm test             → cd webapp && pnpm test
pnpm test:watch       → cd webapp && pnpm test:watch
npx vitest run src/…  → npx vitest run webapp/src/…
```

### 5단계: android/ 디렉터리 신설

```bash
mkdir android
touch android/.gitkeep
```

### 6단계: 동작 확인 후 커밋

```bash
cd webapp
pnpm install          # node_modules 재설치
pnpm test             # 테스트 통과 확인
pnpm build            # 빌드 확인 (선택)
cd ..
git add -A
git status            # 확인
```

## 사용자 수동 작업

커밋 이후 아래를 직접 수행:

1. `.env.local` 이동: `mv .env.local webapp/.env.local`
2. `cd webapp && pnpm install` 재실행
3. `cd webapp && pnpm dev` 로 정상 동작 최종 확인

## 주의사항

- `git mv` 사용 필수 — `cp + rm`은 이력 단절
- 훅 수정 → git mv 순서로 진행 (훅이 먼저 업데이트되어야 impl 커밋 가능)
- `.gitignore` 앞 `/` 는 해당 파일이 위치한 디렉터리 기준이므로 `webapp/` 이동 후에도 동일하게 동작
