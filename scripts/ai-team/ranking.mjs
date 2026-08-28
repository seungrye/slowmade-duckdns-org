// 모델 순위 — 측정 결과를 순서로 (#305).
//
// ── 왜 skip 과 fail 을 나누나 ───────────────────────────────────────────
//
// 후보 5개를 처음 쟀을 때 셋이 실패했다. 원인이 능력이 아니라 **무료 일일 한도 소진**이었다:
//
//   z-ai/glm-5.2:free    Rate limit exceeded: free-models-per-day
//   minimax-m3:free      OK
//
// 그대로 순위에 반영했으면 멀쩡한 모델 셋이 영구 강등됐다. **못 잰 것과 못 하는 것은
// 다르다.** 못 잰 것은 이전 순위를 지킨 채 통과한 것들 뒤에 둔다 — 한도 한 번에 좋은
// 모델이 밀려나면 안 된다.
//
// 판정만 여기 둔다 — 실제 실행은 bakeoff.mjs 가 한다. 그래야 네트워크 없이 시험한다.

/** 순위 파일이 이보다 오래되면 안 믿는다. 2주. */
export const RANKING_MAX_AGE_SEC = 14 * 24 * 3600;

/** 순위 파일 자리. 두 계정이 함께 쓰는 디렉터리(#303)에 둔다. */
export const RANKING_PATH = '/var/lib/ai-team/model-ranking.json';

/** 통과 → 못 잼 → 실패. 낮을수록 앞. */
const 등급 = (status) => (status === 'pass' ? 0 : status === 'skip' ? 1 : 2);

/**
 * 측정 결과 → 순서.
 *
 * @param {{results?: Array<{id:string,status:string,seconds?:number}>, previous?: string[]}} 입력
 * @returns {string[]} 앞이 우선
 */
export function rankResults({ results, previous } = {}) {
  if (!Array.isArray(results)) return [];
  const 이전 = Array.isArray(previous) ? previous : [];
  const 항목 = results.filter((r) => typeof r?.id === 'string' && r.id);

  return 항목
    .map((r) => {
      const g = 등급(r.status);
      // 못 잰 것은 **이전 순위**로 줄을 세운다. 이전에 없던 것은 있던 것들 뒤로.
      const 키 = g === 0 ? Number(r.seconds) || 0
        : g === 1 ? (이전.indexOf(r.id) === -1 ? 이전.length : 이전.indexOf(r.id))
          : 0;
      return { id: r.id, g, 키 };
    })
    // 같은 값이면 id 로 갈라 실행마다 순서가 흔들리지 않게 한다.
    .sort((a, b) => a.g - b.g || a.키 - b.키 || a.id.localeCompare(b.id))
    .map((x) => x.id);
}

/**
 * 순위 파일을 읽는다. **믿을 수 없으면 `null`** — 호출측이 코드의 기본 순서로 떨어진다.
 *
 * 낡은 순위는 안 믿는다. 미래 시각도 안 믿는다(시계가 어긋났거나 잘못된 파일이다).
 *
 * @param {string} text
 * @param {{now:number, maxAgeSec?:number}} 옵션
 * @returns {{coder:string[], manager:string[]}|null}
 */
export function readRanking(text, { now, maxAgeSec = RANKING_MAX_AGE_SEC } = {}) {
  if (typeof text !== 'string') return null;
  let j;
  try { j = JSON.parse(text); } catch { return null; }
  if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
  if (typeof j.measuredAt !== 'number' || !Number.isFinite(j.measuredAt)) return null;
  if (j.measuredAt > now) return null;
  if (now - j.measuredAt > maxAgeSec) return null;
  const roles = j.roles;
  if (!roles || typeof roles !== 'object') return null;
  const 뽑기 = (k) => (Array.isArray(roles[k]) ? roles[k].filter((x) => typeof x === 'string') : []);
  return { coder: 뽑기('coder'), manager: 뽑기('manager') };
}
