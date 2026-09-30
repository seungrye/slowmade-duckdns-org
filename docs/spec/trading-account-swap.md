# 자동매매 계좌 교체 절차

계정의 증권사 계좌를 바꿀 때(모의투자 재신청, 실전 전환, 계좌 이관) 밟아야 하는 순서.
**한 단계라도 빠지면 첫 사이클이 틀린 크기로 주문한다.**

## 왜 절차가 필요한가

전략의 영속 상태는 **계좌가 아니라 포트폴리오**에 붙어 있다 —
`TradingPortfolio.state.v4` / `.vr`. 그래서 자격증명만 갈아끼우면 브로커 보유는 0인데
전략 상태(`t`, `cycleCash`, `pending`, VR 의 `cumBuy/cumSell/sinceCycle`)는
옛 계좌 이력 그대로 남는다.

자동으로는 안 풀린다. `reconcileDay` 는 **매도 체결이 있을 때만** 사이클을 리셋한다:

```ts
if (soldQty > 0 && holdingAfter <= 0) { s.t = buyAmt > 0 ? 1.0 : 0.0; ... }
```

새 계좌엔 체결이 아예 없어 이 분기에 못 들어간다. `absorbIdleCash` 는 `cycleCash` 만
건드려 이걸 못 고친다. 결과적으로 보유 0인 계좌에서 `t=3.09` 가 살아남아 "3회차 진행 중"
으로 1회매수금·별지점을 계산한다.

## 순서

**장 시간 밖에서, 한 번에 끝낼 것.** 사이클 한가운데서 자격증명이나 상태가 바뀌면 그 날
계산이 섞인다.

### ① 실주문을 먼저 끈다

마이페이지 > 설정에서 계정의 실주문을 끄거나, 사고 중이면 킬스위치
(`POST /api/my/trading/kill`)를 쓴다. 이게 먼저다 — 아래 단계 도중에 스케줄러가 돌면 안 된다.

### ② 앱키·시크릿·계좌번호를 **셋 다** 바꾼다

모의투자 앱키는 **계좌에 묶여 있다.** 계좌번호만 바꾸면 조회부터 실패한다:

```
50194613 (옛 계좌) → rt_cd=0  예수금 조회 정상
50215100 (새 계좌) → rt_cd=2  OPSQ2000 INPUT INVALID_CHECK_ACNO   ← 옛 앱키로 물었을 때
```

KIS Developers 포털에서 새 계좌로 앱키를 재발급받아 마이페이지 > 설정에서 함께 교체한다.

### ③ 전략 상태를 초기화한다

```bash
cd ~/site/webapp
pnpm dlx tsx --env-file=.env.local scripts/reset-strategy-state.ts                      # 미리보기
pnpm dlx tsx --env-file=.env.local scripts/reset-strategy-state.ts --apply --reason "계좌 교체 50215100"
```

지우지 않고 `state.archive` 로 옮긴다(소프트 삭제) — 잘못 눌러도 되돌린다. 이력은 최근
10건까지 쌓인다. 판단 로직은 `src/lib/trading/state-reset.ts`(순수, 테스트 있음)에 있고
스크립트는 껍데기다.

특정 블록만 하려면 `--portfolio <id>`.

### ④ dry-run 으로 한 사이클 확인

실주문을 켜기 전에 계획이 신규 진입(`t=0` 에서 1회차)으로 나오는지 본다. 보유 0인데
회차가 이어지면 ③이 안 먹은 것이다.

### ⑤ 실주문을 켜고 접수를 확인한다

첫 사이클 요약이 `접수 N건/계획 M건` 으로 나오는지 본다. `접수 0건` 이면 실패로 끊기고
분류된 사유와 함께 메일이 온다(`lib/trading/reject-reason.ts`).

## 안 하는 것 — 알고 남겨 둔 구멍

상태와 브로커 보유의 **불일치를 자동으로 감지해 주문을 끊는 가드는 없다.** 그래서 ③을
잊으면 이 문서가 설명한 사고가 그대로 난다. 절차에 의존하는 설계이므로, 계좌를 자주
갈아탈 일이 생기면 가드를 넣는 쪽이 맞다(#513 논의 참조).

## 관련

- `src/lib/trading/state-reset.ts` — 무엇을 지우고 무엇을 남기는지
- `src/lib/trading/infinite-v4-state.ts` — `reconcileDay` · `absorbIdleCash`
- `src/lib/trading/reject-reason.ts` — 주문 거부 사유 분류(계좌 문제는 `needsAction: true`)
