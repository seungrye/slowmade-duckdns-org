# 파이프라인 실패 경로 — 테스트로 덮고, 복구를 한 곳으로

관련: #282(실패 경로 미검증) · #283(에이전트 실패가 흔적 없이 죽음) · #284(워크트리 기준)

## 왜

`scripts/ai-team/pipeline.mjs` 의 실패 쪽 분기는 **한 번도 실행된 적이 없다**(#282).
모순을 스펙에 심어 유도해 봤지만 클로드가 테스트 단계에서 흡수해 버려 닿지 못했다.
이 저장소에서 코더의 테스트 변조 금지는 서로 다른 이유로 **세 번** 뚫렸고(#275 #277 #279),
매번 위반을 재현해서야 잡았지 코드를 읽어서 잡은 적이 없다. **미실행 코드는 작동한다는
근거가 없다.**

유도가 어려운 이유는 그 분기들이 **부수효과 한가운데 인라인으로** 박혀 있어서다. 판정을
꺼내면 네트워크·파일·에이전트 없이 시험할 수 있다. `gate.mjs`·`snapshot.mjs` 가 이미
같은 방식으로 분리돼 있으니 그 관행을 따른다.

## 무엇을 만드나

### 1. `scripts/ai-team/rescue.mjs` — 순수 판정·보고

| 내보내는 것 | 하는 일 |
|---|---|
| `StuckKind` | 어디서 막혔나 — `AGENT_FAILED` / `ROUNDS_EXHAUSTED` / `RED_GATE` |
| `revertPlan(before, after)` | 클로드가 만진 구현을 되돌릴 계획 (#282 셋째 경로) |
| `needsRebaseline(before, after)` | 클로드가 테스트를 고쳤나 (#282 둘째 경로) |
| `stuckTitle(kind, spec)` | 이슈 제목 |
| `stuckIssueBody(info)` | 이슈 본문 — 목적·목표·진행·현재 상황 |
| `stuckComment(info)` | 스레드 덧글 |

`revertPlan` 은 **실행하지 않고 계획만** 돌려준다: `{ path, content }` 면 그 내용으로 쓰고
`{ path, content: null }` 이면 지운다. 그래야 되돌리기를 파일 없이 시험할 수 있다.

### 2. `scripts/ai-team/base.mjs` — 워크트리 기준 (#284)

`resolveBase({ envBase, headRef })` — `PIPELINE_BASE` 가 있으면 그것, 없으면 지금 HEAD.
detached HEAD 면 `main` 으로 떨어진다.

지금은 `'main'` 이 하드코딩돼 있어(`pipeline.mjs:288`) **어느 브랜치에서 돌려도 워크트리
내용이 main** 이다. 그래서 `feat/279-runner-pipeline` 에서 파이프라인을 돌렸을 때 그
브랜치가 새로 넣은 `snapshot.test.ts`(66줄)가 워크트리에 없었다 — 전체 스위트 2712건에
그 브랜치의 가드가 안 들어갔다. **자기 자신을 검증하지 못한다.**

야간 러너는 체크아웃된 트리를 그대로 도는 것이 설계이므로(`ai-team.service:29`), 기본값을
HEAD 로 두면 러너도 의도대로 동작한다. main 을 못박고 싶으면 `PIPELINE_BASE=main`.

### 3. 에이전트 실패도 같은 복구 경로로 (#283)

`runAgent()` 는 실패하면 `die()` 로 즉시 끝난다(`pipeline.mjs:235`). 재시도 없음, 이슈
없음, 덧글 없음, push 없음 — **아무것도 안 남는다.** 실제로 코더 모델이 은퇴해 404 를
돌려주는 동안 야간 러너가 매일 밤 1회차에서 죽었고, 아침에 사람이 볼 수 있는 흔적은
systemd 로그뿐이었다.

"막히면 스레드로 넘긴다" 는 안전망이 **12회 소진 경로에만** 붙어 있는 것이 문제다. 그
경로가 하는 일(브랜치 push + 이슈 생성 + 스레드 덧글)을 `salvage()` 하나로 묶어 **둘 다
같은 것을 부르게** 한다.

## 수용 기준

- `revertPlan` — 새로 만든 것은 삭제 계획, 고친 것은 원본 내용 복원 계획, 안 건드린 것은 계획 없음
- `needsRebaseline` — 내용이 바뀌었을 때만 참. 이름만 같고 내용이 같으면 거짓
- `stuckIssueBody` — 종류별로 본문이 다르고, 네 가지(목적·목표·진행·현재 상황)를 모두 담는다
- `stuckComment` — `POST_ID` 없이도 만들어지고, 출력이 길면 잘린다
- `resolveBase` — env 우선, 없으면 HEAD, detached 면 main
- 위 전부 네트워크·파일 없이 도는 vitest 테스트로 덮인다

---

## ✅ 완료 (2026-08-27)

| 수용 기준 | 결과 |
|---|---|
| `revertPlan` — 생성/수정/무변경 | ✅ 삭제된 것을 되살리는 경우까지 덮음 |
| `needsRebaseline` — 내용 기준 | ✅ 생성·수정·삭제 모두 참, 동일이면 거짓 |
| `stuckIssueBody` — 네 가지 | ✅ 목적·목표·진행·현재 상황 |
| `stuckComment` — 잘림 | ✅ 5000자 상한 아래로 |
| `resolveBase` — env/HEAD/detached | ✅ |
| 네트워크·파일 없이 도는 테스트 | ✅ 33건 |

전체 스위트 2675건 초록(268파일). typecheck·lint 통과.

`changedBetween` 은 `pipeline.mjs` 에서 쓰지 않게 됐다 — 되돌리기가 삭제를 못 보는
구멍이 있어 `revertPlan` 으로 갈았다. `snapshot.mjs` 에는 남겨 둔다(다른 자리에서 쓴다).
