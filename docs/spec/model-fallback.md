# 모델을 못박지 말고 순위표에서 고른다

관련: #301

## 왜

모델 이름이 네 곳에 못박혀 있다 — `coder.mjs`·`coder-run.sh`·`pipeline.mjs`·`.env.local`.
주석도 "손댈 땐 넷을 함께 고칠 것" 이라 적혀 있다. 그리고 이미 두 번 당했다:
`stealth/ox-alpha` 은퇴로 야간 러너가 매일 밤 조용히 죽었고(#283), 새 계정에서 난
`Model not found` 가 은퇴인지 캐시 문제인지 가리는 데 시간이 들었다(#294).

무료 목록은 자주 갈린다 — 최근 몇 주에 20 → 15 → 14 → 18 개로 바뀌었고 Llama·Qwen
무료 티어는 통째로 사라졌다.

## 어떻게

역할별 **순위표**를 두고 실행 시점에 살아 있는 것 중 제일 위를 고른다.

1. OpenRouter `/api/v1/models` 를 받는다
2. **도구 호출(`tools`)을 지원하는 것**만 남긴다 — opencode 가 쓰려면 필수다
3. 순위표에서 살아 있는 첫 번째를 고른다
4. 1순위가 아니면 **로그에 남긴다** — 1순위가 죽었다는 뜻이라 사람이 알아야 한다
5. 목록 조회가 실패하면 **1순위를 그대로 쓴다** — 조회 실패로 러너가 멈추면 안 된다

## 후보는 오픈 웨이트만

`:free` 변형은 전부 제공자가 1개(후원자)라 그 자체로는 신호가 안 된다. **기반 모델의
제공자 수**가 지표다 — 여럿이 호스팅하면 무료판이 사라져도 갈아탈 곳이 있다.

| 기반 제공자 | 모델 | |
|---|---|---|
| 29 | `z-ai/glm-5.2` | 쓴다 |
| 15 | `google/gemma-4-31b-it` | 쓴다 |
| 11 | `minimax/minimax-m3` | 쓴다 |
| 3 | `thinkingmachines/inkling` | 쓴다 |
| 2 | `nvidia/nemotron-3-super-120b-a12b` | 쓴다 |
| **1 (자기 자신뿐)** | `poolside/*`·`cohere/north-mini-code`·`dots-studio/*-preview`·`inclusionai/*`·`liquid/*` | **제외** |

순위는 측정으로 정한다 — 파이프라인 코더 1회차와 같은 조건으로 돌려 게이트 통과·테스트
변조·소요 시간을 본다.

## 만들 것 — `scripts/ai-team/model-pick.mjs`

| 내보내는 것 | 하는 일 |
|---|---|
| `CODER_PREFERENCE` · `MANAGER_PREFERENCE` | 역할별 순위표 |
| `toolCapableIds(json)` | `/api/v1/models` 응답 → 도구 지원 id 목록 |
| `pickModel({preferred, available})` | 살아 있는 첫 번째와 그 순위 |

CLI: `model-pick.mjs --role coder` → 고른 id 를 표준출력에. 조회 실패면 1순위.

## 수용 기준

- 1순위가 살아 있으면 그것을, 죽었으면 다음을 고른다
- 하나도 안 살아 있으면 `null` — 호출측이 1순위로 떨어진다
- 순위(index)를 함께 준다. 0 이 아니면 호출측이 경고를 남긴다
- 도구 미지원 모델은 후보에서 빠진다
- 응답이 깨졌거나(빈 값·배열 아님·필드 없음) 목록이 비어도 터지지 않는다
- 위 전부 네트워크 없이 도는 vitest 로 덮는다
