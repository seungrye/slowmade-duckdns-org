#!/usr/bin/env node
// 모델을 못박지 말고 순위표에서 고른다 (#301).
//
// ── 왜 ──────────────────────────────────────────────────────────────────
//
// 모델 이름이 네 곳에 못박혀 있었다 — coder.mjs·coder-run.sh·pipeline.mjs·.env.local.
// 그리고 이미 두 번 당했다. `stealth/ox-alpha` 가 은퇴해 404 를 돌려주는 동안 야간 러너가
// **매일 밤 조용히 죽었고**(#283), 새 계정에서 난 `Model not found` 가 은퇴인지 캐시
// 문제인지 가리는 데 시간이 들었다(#294).
//
// 무료 목록은 자주 갈린다 — 최근 몇 주에 20 → 15 → 14 → 18 개로 바뀌었고 Llama·Qwen
// 무료 티어는 통째로 사라졌다. 못박아 두면 그때마다 밤에 죽는다.
//
// ── 후보를 어떻게 골랐나 ────────────────────────────────────────────────
//
// **오픈 웨이트만 담는다.** `:free` 변형은 전부 제공자가 1개(후원자)라 그 자체로는 신호가
// 안 되고, **기반 모델의 제공자 수**가 지표다 — 여럿이 호스팅하면 무료판이 사라져도
// 갈아탈 곳이 있다. 실측한 기반 제공자 수:
//
//   z-ai/glm-5.2 29 · google/gemma-4-31b-it 15 · minimax/minimax-m3 11
//   thinkingmachines/inkling 3 · nvidia/nemotron-3-super-120b-a12b 2
//   poolside/* · cohere/north-mini-code · dots-studio/*-preview ·
//   inclusionai/* · liquid/*  → 1(자기 자신뿐), 제외
//
// 판정은 순수 함수로 둔다 — 네트워크는 CLI 쪽이 맡는다. 그래야 시험할 수 있다.
import { readFileSync } from 'node:fs';
// 주 1회 측정 결과가 있으면 그 순서를 쓴다 (#305).
import { readRanking, RANKING_PATH } from './ranking.mjs';

// ── 순위는 실측이다 (#307) ──────────────────────────────────────────────
//
// 위 넷은 **공유 풀 밖**이다. OpenRouter 무료 한도는 계정 전체 공유이고(하루 50회,
// 크레딧 0 기준) 오류 메타데이터가 그렇게 말한다:
//
//   limit_source: openrouter_free_tier_daily   X-RateLimit-Limit: 50   Remaining: 0
//
// 그런데 풀이 0 인데도 되는 모델이 있다 — minimax 계열과 inkling 이 그렇다. 코더가
// 하루 144회 헛돌고도(#303) 멀쩡했던 이유가 이것이다. 그래서 **풀 밖을 위에 둔다.**
// 아래 셋은 풀 소속이라 하루 50회에 묶이지만, 위가 전부 죽었을 때의 마지막 수단으로 남긴다.
//
// "풀 밖" 은 문서로 보장된 것이 아니라 실측이다. 주 1회 측정(#305)이 변화를 잡는다.

/**
 * 구현(코더) 순위.
 *
 * 파이프라인 코더 1회차와 같은 조건(실패 테스트 7건 + 껍데기)으로 재서 게이트 초록까지
 * 걸린 시간 — m3 16초, inkling 18초. m2.7 은 구현으로 재지 않아 셋째에 둔다.
 */
export const CODER_PREFERENCE = Object.freeze([
  'minimax/minimax-m3:free',
  'thinkingmachines/inkling:free',
  'minimax/minimax-m2.7:free',
  'z-ai/glm-5.2:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-31b-it:free',
]);

/**
 * 관리(진단·검수·야간 러너) 순위.
 *
 * `review()` 프롬프트를 그대로 써서 **테스트만 겨우 통과하는 하드코딩 구현을 잡아내는지**와
 * **제대로 된 구현을 통과시키는지**(거짓 양성)를 함께 쟀다. 셋 다 만점이었고 구현을
 * 건드리지도 않았다. 순서는 두 경우 합계 시간 — m3 41초 < m2.7 65초 < inkling 123초.
 */
export const MANAGER_PREFERENCE = Object.freeze([
  'minimax/minimax-m3:free',
  'minimax/minimax-m2.7:free',
  'thinkingmachines/inkling:free',
  'z-ai/glm-5.2:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'google/gemma-4-31b-it:free',
]);

/**
 * `/api/v1/models` 응답 → **도구 호출이 되는** 모델 id 목록.
 *
 * opencode 는 도구를 쓰는 에이전트라 `tools` 미지원 모델은 후보가 못 된다.
 * **모르는 것을 된다고 치지 않는다** — `supported_parameters` 가 없으면 뺀다.
 *
 * 응답이 깨져도 터지지 않고 빈 목록을 준다. 조회가 깨졌다고 러너가 멈추면 안 된다.
 */
export function toolCapableIds(json) {
  const list = json?.data;
  if (!Array.isArray(list)) return [];
  return list
    .filter((m) => Array.isArray(m?.supported_parameters) && m.supported_parameters.includes('tools'))
    .map((m) => m?.id)
    .filter((id) => typeof id === 'string' && id);
}

/**
 * 순위표에서 **살아 있는 첫 번째**.
 *
 * @returns {{id:string, index:number}|null} `index` 가 0 이 아니면 위 순위가 죽은 것이다 —
 *   호출측이 그걸 로그에 남겨야 사람이 안다. 하나도 없으면 `null`.
 */
export function pickModel({ preferred, available } = {}) {
  if (!Array.isArray(preferred) || !Array.isArray(available)) return null;
  const 살아있음 = new Set(available);
  for (const [index, id] of preferred.entries()) {
    if (살아있음.has(id)) return { id, index };
  }
  return null;
}

/**
 * 이 역할의 순위표. **주 1회 측정 결과가 있으면 그것을 쓴다** (#305).
 *
 * 측정 파일이 없거나 낡았으면 코드에 박힌 기본 순서로 떨어진다 — 측정이 멈춰도 러너는
 * 계속 돈다. 측정에 없던 후보는 뒤에 붙여 새로 추가한 모델이 사라지지 않게 한다.
 */
function preferenceFor(role, warn = () => {}) {
  const 기본 = role === 'manager' ? MANAGER_PREFERENCE : CODER_PREFERENCE;
  let 잰것 = null;
  try {
    잰것 = readRanking(readFileSync(RANKING_PATH, 'utf8'), { now: Math.floor(Date.now() / 1000) });
  } catch { /* 없으면 기본 */ }
  const 순서 = 잰것?.[role];
  if (!순서?.length) return 기본;
  // 측정에 없던 기본 후보를 뒤에 붙인다.
  const 남은 = 기본.filter((m) => !순서.includes(m));
  if (순서[0] !== 기본[0]) warn(`측정 순위를 씁니다 — 1순위 ${순서[0]}`);
  return [...순서, ...남은];
}

/**
 * 지금 쓸 모델 하나를 정한다 — 목록을 받아 순위표와 맞춘다.
 *
 * **조회가 실패하면 1순위를 그대로 쓴다.** 목록을 못 받았다고 러너가 멈추는 것이 더 나쁘다.
 * 1순위가 아닌 것이 골라지면 `warn` 으로 알린다 — 위가 죽었다는 뜻이라 사람이 알아야 한다.
 *
 * @param {'coder'|'manager'} role
 * @param {(m:string)=>void} [warn]
 */
export async function resolveModel(role, warn = () => {}) {
  const preferred = preferenceFor(role, warn);
  let available = [];
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      signal: AbortSignal.timeout(15_000),
    });
    available = toolCapableIds(await res.json());
  } catch (e) {
    warn(`모델 목록을 못 받았습니다(1순위로 진행): ${e?.message ?? e}`);
    return preferred[0];
  }

  const 고름 = pickModel({ preferred, available });
  if (!고름) {
    warn('순위표에 살아 있는 모델이 없습니다 — 1순위로 진행합니다.');
    return preferred[0];
  }
  if (고름.index > 0) {
    warn(`${preferred.slice(0, 고름.index).join(', ')} 가 목록에 없습니다 → ${고름.id}`);
  }
  return 고름.id;
}

// ── CLI ─────────────────────────────────────────────────────────────────
//
// `model-pick.mjs --role coder|manager` → 고른 id 를 표준출력에.
// 셸(coder-run.sh)이 쓴다. 알림은 표준에러로 나가므로 값과 안 섞인다.
if (process.argv[2] === '--role') {
  const role = process.argv[3];
  if (role !== 'coder' && role !== 'manager') {
    console.error('사용법: model-pick.mjs --role <coder|manager>');
    process.exit(2);
  }
  console.log(await resolveModel(role, (m) => console.error(`\x1b[1;33m[model-pick]\x1b[0m ${m}`)));
}
