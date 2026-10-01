# 실주문·스케줄러 게이트 env 분리

실주문 여부를 정하는 두 env 는 **프로덕션 systemd 유닛 전용 파일**에 있다.

```
webapp/.env.trading          ← TRADING_LIVE_ALLOWED · TRADING_SCHEDULER_ENABLED (gitignore)
/etc/systemd/system/webapp@.service
    EnvironmentFile=-/home/seungrye/site/webapp/.env.local
    EnvironmentFile=-/home/seungrye/site/webapp/.env.trading   ← 이 줄
```

## 왜 분리했나

둘 다 `.env.local` 에 있었다. Next 는 `.env.local` 을 **자동으로 읽는다** — 그래서
`pnpm dev` 도, 블루그린의 **비서빙 인스턴스**도 같은 값을 읽어 스케줄러를 띄웠다.
real 전환 순간 아무 node 프로세스나 실주문 주체가 된다. `TradingRun` 의 클레임 unique 는
중복 주문만 막고 **"구 코드가 그날 주문을 낸다"** 는 못 막는다.

`.env.trading` 은 Next 의 자동 로딩 대상이 아니다(`.env` · `.env.local` · `.env.production`
만 읽는다). systemd 가 주입할 때만 들어간다 → **dev 에서는 둘 다 미설정 = 꺼짐.**

## 실측 검증 (2026-10-01)

```
프로덕션 프로세스 환경   TRADING_LIVE_ALLOWED=true · TRADING_SCHEDULER_ENABLED=true  ✓
.env.local 로더(dev)     둘 다 undefined                                             ✓
재시작 후 로그           [trading] 스케줄러 시작 — 60초 틱, catch-up 포함            ✓
```

## 주의

- **유닛을 먼저 고치고 검증한 뒤** `.env.local` 에서 빼야 한다. 반대로 하면 매매가 멈춘다.
- 서버를 옮기거나 유닛을 다시 만들면 `EnvironmentFile` 두 줄을 같이 가져가야 한다.
- `.env.trading` 은 `.gitignore`(`.env*`) 대상이라 저장소에 없다 — 호스트에만 있다.
- dev 에서 스케줄러를 일부러 돌려야 하면 그 셸에만 env 를 주되, **프로덕션과 같은 DB 를
  보면 실주문이 나갈 수 있다**(`webapp-dev-server-starts-trading-scheduler` 참고).
