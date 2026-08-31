## 계정·시장당 포트폴리오 여러 개 (#339)

미장 포트폴리오를 **추가**했더니 기존 것이 **교체**됐다. 버그가 아니라 설계 제약이었다:

```
TradingPortfolioSchema.index({ accountId: 1, market: 1 }, { unique: true }); // 계정당 시장 1블록
```

`POST /api/my/trading/portfolios` 가 이 키로 upsert 하니 "추가"가 곧 "교체"였다.
TQQQ `infinite_v4` 블록이 `value_rebalancing` 으로 바뀌며 옛 설정값이 사라졌고,
**복구가 안 됐다** — DB 백업이 없고 `tradingruns` 는 config 를 안 남긴다.

## 막고 있던 것은 둘뿐이었다

스케줄러는 이미 `find({enabled:true})` 후 루프라 여러 블록을 돌 수 있고, 포트폴리오
스냅샷도 (계좌, 통화) 단위라 충돌하지 않는다. 실제로 막고 있던 것은 **유니크 인덱스**와
**현금**이다.

## 현금 — 겹쳐 쓰면 안 된다

엔진들이 계좌 예수금을 **통째로** 읽는다.

| 엔진 | 자리 |
|---|---|
| LRS | `engines.ts:160` |
| rotation | `engines.ts:208` |
| trend | `engines.ts:309` |
| infinite_v4 · VR | `infinite-v4-engine.ts:67·128` |

미장 블록이 둘이면 둘 다 "이 돈이 다 내 것"이라 믿고, 합쳐서 잔고의 두 배를 쓰려 든다.
v4·VR 은 `config.principal` 로 자기 몫을 알지만 `absorbIdleCash` 가 계좌 현금을 끌어다 써서
**다른 블록의 돈까지 흡수**할 수 있다.

## 예약 — 블록마다 금액을 적는다

`reservedCash` 를 블록에 둔다. **비우면(0/없음) 전액** — 지금과 똑같이 돌아 기존 문서를
건드릴 필요가 없다.

판정은 순수 함수로 뺀다(`lib/trading/reservation.ts`). 파이썬 `reservation.py` 와 같은 생각:
**만든 순서대로 선점**하고, 남은 돈이 모자라면 남은 만큼만 주고, 0 이면 그날 보류한다.

합이 현금을 넘어도 **저장은 막지 않는다.** 평가액이 줄어든 날 멀쩡한 설정까지 못 고치게
되는 쪽이 더 나쁘다. 저장 때 경고하고, 실행 때 보류되면 로그에 남긴다.

## 엔진은 한 줄도 안 고친다

현금이 들어오는 문은 브로커 둘뿐이다 — `LiveBroker.account()` 와 `V4Broker.snapshot()`.
`runPortfolio` 가 브로커를 만드는 **세 자리**(v4 · VR · 일반)에 얇은 래퍼를 씌워 `cash` 만
줄이고 나머지는 그대로 위임한다. 엔진 로직·테스트를 안 건드리므로 회귀 위험이 가장 작다.

## 인덱스는 손으로 지워야 한다

mongoose 는 스키마에서 인덱스를 빼도 **이미 만들어진 DB 인덱스를 지우지 않는다.**
`scripts/drop-portfolio-unique-index.mjs` 가 한 번 돌며 지운다. 안 지우면 두 번째 블록을
만들 때 duplicate key 로 실패한다.

## 화면

시장별 단일 폼에서 **블록 목록 + 추가/수정**으로. 저장은 그 블록만 건드리고,
`POST` 는 `portfolioId` 가 있으면 수정, 없으면 새로 만든다. 삭제 시 통화 블록 숨김은
**그 통화의 마지막 블록일 때만** 한다.
