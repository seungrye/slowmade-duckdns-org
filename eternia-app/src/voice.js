// Choosing the prose style (voice) - the app's copy (#87).
//
// The rules are the same as the web's webapp/src/lib/web-adventure/voice.ts. The app is a vanilla JS bundle, so it
// shares no code and implements the same rules separately. **Changing a rule means changing both**
// - out of step, the same story is read in different styles on the web and in the app.
//
// Why only complete styles are chosen: a scene with an empty variant falls back to the default body. Choosing an incomplete
// style makes the style vary scene by scene within a run and breaks the immersion.

export const DEFAULT_VOICE = "default";

/** The key holding the style to use for one run. */
export const RUN_VOICE_KEY = "eternia:run-voice";

/**
 * Picks one style from the coverage. The candidates are the default style plus the complete ones.
 * @param {Record<string, {filled:number,total:number,complete:boolean}>} coverage
 * @param {() => number} [rnd] 0<=x<1 (injected in tests)
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
 * Decides the style for this run.
 * The priority: override > a value already drawn for this run > a fresh draw.
 *
 * @param {object} args
 * @param {Record<string, {complete:boolean}>} args.coverage
 * @param {string} [args.override] forced (debugging, or entry by link)
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
    saved = null; // A failed storage access is ignored - play must not be blocked over a prose style.
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
