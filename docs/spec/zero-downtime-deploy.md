---
name: zero-downtime-deploy
description: nginx upstream + systemd Blue/Green 무중단 배포를 위한 webapp 측 사전 작업
---

# ✅ 무중단 배포 — webapp 측 사전 작업

## 배경

현재 배포 절차는 `screen` 세션에서 `pnpm run build && pnpm run start` 를 수동 실행하는 방식이라
빌드 시간 + 재시작 동안 트래픽이 끊긴다. nginx upstream + systemd 템플릿 유닛 기반의
Blue/Green 무중단 배포로 전환하기 위해 webapp 코드에 두 가지 사전 작업이 필요하다.

상세 인프라 절차는 [docs/deployment.md](../deployment.md) 참조.

## 변경 사항

### 1. `NEXT_DISTDIR` 환경변수로 빌드 디렉터리 격리

Blue/Green 두 인스턴스(포트 3010, 3011)가 같은 `.next/` 를 공유하면, 한 쪽이 새 빌드를
덮어쓰는 순간 다른 쪽이 lazy-load 하는 청크가 깨질 수 있다. 인스턴스마다 별도
디렉터리(`.next-3010`, `.next-3011`)를 쓰도록 `next.config.ts` 에 `distDir` 를 환경변수로
주입한다.

#### `webapp/next.config.ts`

```ts
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DISTDIR ?? '.next',
  // ... 기존 옵션
};
```

- env 미설정 시 기본값 `.next` 유지 → 기존 개발/빌드 동작 100% 호환
- 빌드 시: `NEXT_DISTDIR=.next-3011 pnpm build`
- 실행 시: 동일 env 로 `pnpm start` 실행 (systemd 유닛이 주입)

### 2. `GET /api/health` 헬스체크 엔드포인트

배포 스크립트가 새 인스턴스 기동 후 트래픽을 전환해도 되는지 폴링으로 확인하는 용도.

#### `webapp/src/app/api/health/route.ts`

```ts
import { apiSuccess } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET() {
  return apiSuccess({ ok: true });
}
```

- 응답: `200 { success: true, data: { ok: true } }`
- DB/MinIO 의존성 없이 프로세스가 살아있고 라우팅이 동작하는지만 확인 (liveness)
- `dynamic = 'force-dynamic'` — 캐시 방지로 매 요청 실제 프로세스가 응답
- 인증 불필요 (정보 노출 없음)

## 검증

- `next.config.ts`: `NEXT_DISTDIR=.next-test pnpm build` 로 `.next-test/` 생성 확인,
  env 미설정 시 `.next/` 그대로 사용됨을 확인.
- `/api/health` 단위 테스트: `GET` 핸들러가 200 + `{ok:true}` 를 반환한다.

## 비-목표

- DB/외부 의존성을 점검하는 readiness probe — 별도 엔드포인트로 추후 검토.
- 빌드 산출물 검증 자동화 — 일단 사람이 확인.
