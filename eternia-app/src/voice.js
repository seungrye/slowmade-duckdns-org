// 문체(voice) 선택 — 앱판 (#87).
//
// 규칙은 웹의 webapp/src/lib/web-adventure/voice.ts 와 같다. 앱은 vanilla JS 번들이라
// 코드를 공유하지 않고 같은 규칙을 따로 구현한다. **규칙을 바꿀 때는 양쪽을 함께 고쳐야
// 한다** — 어긋나면 같은 이야기를 웹과 앱에서 다른 문체로 읽게 된다.
//
// 왜 완비된 문체만 고르는가: 변형이 비어 있는 씬은 기본 본문으로 폴백된다. 미완비 문체를
// 고르면 한 판 안에서 문체가 씬마다 갈려 몰입이 깨진다.

export const DEFAULT_VOICE = "default";

/** 한 판(run) 동안 쓸 문체를 저장해 두는 키. */
export const RUN_VOICE_KEY = "eternia:run-voice";

/**
 * 커버리지에서 문체 하나를 고른다. 후보는 기본 문체 + 완비된 문체.
 * @param {Record<string, {filled:number,total:number,complete:boolean}>} coverage
 * @param {() => number} [rnd] 0<=x<1 (테스트에서 주입)
 * @returns {string}
 */
export function pickVoiceFromCoverage(coverage, rnd) {
  const random = rnd || Math.random;
  const complete = Object.keys(coverage || {})
    .filter((v) => v !== DEFAULT_VOICE && coverage[v] && coverage[v].complete)
    .sort();
  const candidates = [DEFAULT_VOICE].concat(complete);
  const i = Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)));
  return candidates[i];
}

/**
 * 이번 판에 쓸 문체를 정한다.
 * 우선순위: override > 이 판에서 이미 뽑아 둔 값 > 새로 뽑기.
 *
 * @param {object} args
 * @param {Record<string, {complete:boolean}>} args.coverage
 * @param {string} [args.override] 강제 지정(디버그·링크 진입)
 * @param {{getItem:(k:string)=>string|null, setItem:(k:string,v:string)=>void}} [args.storage]
 * @param {() => number} [args.rnd]
 * @returns {string}
 */
export function chooseRunVoice(args) {
  const { coverage, override, storage, rnd } = args || {};
  if (override) return override;

  const usable = (v) =>
    v === DEFAULT_VOICE || Boolean(coverage && coverage[v] && coverage[v].complete);

  let saved = null;
  try {
    saved = storage ? storage.getItem(RUN_VOICE_KEY) : null;
  } catch {
    saved = null; // 저장소 접근 실패는 무시 — 문체 하나 때문에 플레이가 막히면 안 된다.
  }
  if (saved && usable(saved)) return saved;

  const picked = pickVoiceFromCoverage(coverage || {}, rnd);
  try {
    if (storage) storage.setItem(RUN_VOICE_KEY, picked);
  } catch {
    /* 무시 */
  }
  return picked;
}
