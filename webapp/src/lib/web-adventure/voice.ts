// Prose-style (voice) variants - the treatment is canonical for events, and only the expression differs per style. (#73)
//
// Two design principles:
//  1) The treatment (the skeleton) **never reaches the screen.** With no variant it falls back to the default body.
//     Exposing the skeleton breaks immersion outright, while the default body is a finished style in its own right.
//  2) The random choice considers **only complete styles**, because the voice must not wander within one run.
//     An incomplete style is used only when selected manually (a preview).

/** The default style - the scene's body as it stands. Always complete. */
export const DEFAULT_VOICE = 'default';

/** The minimum shape needed to assemble a style (it accepts both a model and a lean result). */
export type VoicedScene = {
  id?: string;
  body: string[];
  treatment?: string[];
  variants?: Record<string, string[] | undefined> | null;
};

export type Coverage = { filled: number; total: number; complete: boolean };

function variantOf(scene: VoicedScene, voice: string): string[] | null {
  const v = scene.variants?.[voice];
  return Array.isArray(v) && v.length > 0 ? v : null;
}

/** The body to render this scene in the requested style. Absent, the default body (never the skeleton). */
export function resolveBody(scene: VoicedScene, voice: string = DEFAULT_VOICE): string[] {
  if (voice && voice !== DEFAULT_VOICE) {
    const v = variantOf(scene, voice);
    if (v) return v;
  }
  return scene.body;
}

/** How many scenes are filled in per style. Used by the CMS's progress and the random-candidate check. */
export function voiceCoverage(scenes: VoicedScene[]): Record<string, Coverage> {
  const total = scenes.length;
  const filled: Record<string, number> = {};
  for (const s of scenes) {
    for (const [voice, body] of Object.entries(s.variants ?? {})) {
      if (Array.isArray(body) && body.length > 0) filled[voice] = (filled[voice] ?? 0) + 1;
    }
  }
  const out: Record<string, Coverage> = {};
  for (const [voice, n] of Object.entries(filled)) {
    out[voice] = { filled: n, total, complete: total > 0 && n === total };
  }
  return out;
}

/** The styles that exist - the default first, the rest by name. */
export function listVoices(scenes: VoicedScene[]): string[] {
  const names = Object.keys(voiceCoverage(scenes)).sort();
  return [DEFAULT_VOICE, ...names.filter((n) => n !== DEFAULT_VOICE)];
}

/**
 * Picks the style to use at the start of a run. It draws only from the complete variants plus the default style.
 * @param rnd 0 <= x < 1 (injected in tests)
 */
export function pickVoice(scenes: VoicedScene[], rnd: () => number = Math.random): string {
  return pickVoiceFromCoverage(voiceCoverage(scenes), rnd);
}

/**
 * Picks a style from the coverage alone (#79).
 *
 * The client receives scenes with their variants stripped, so completeness cannot be told from scenes.
 * So it draws from the response's voices (the coverage). Only complete ones are candidates because picking an
 * incomplete style makes the empty scenes fall back to the default body and mixes styles within a run.
 */
export function pickVoiceFromCoverage(
  coverage: Record<string, Coverage>,
  rnd: () => number = Math.random,
): string {
  const candidates = [
    DEFAULT_VOICE,
    ...Object.entries(coverage)
      .filter(([voice, c]) => c.complete && voice !== DEFAULT_VOICE)
      .map(([voice]) => voice)
      .sort(),
  ];
  const i = Math.min(candidates.length - 1, Math.max(0, Math.floor(rnd() * candidates.length)));
  return candidates[i];
}

/** The key storing the style used for one run. */
export const RUN_VOICE_KEY = 'web-adventure:run-voice';

type VoiceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Decides the style for this run (#79).
 *
 * Priority: the URL's override > a value already drawn for this run > a fresh draw.
 * A style differing scene by scene within a run breaks immersion, so the drawn value is stored and kept.
 * If the stored style is no longer complete (coverage broken by an added scene, say) it is drawn again.
 */
export function chooseRunVoice(args: {
  coverage: Record<string, Coverage>;
  override?: string;
  storage?: VoiceStorage;
  rnd?: () => number;
}): string {
  const { coverage, override, storage, rnd = Math.random } = args;
  if (override) return override;

  const isUsable = (v: string) => v === DEFAULT_VOICE || coverage[v]?.complete === true;

  const saved = storage?.getItem(RUN_VOICE_KEY) ?? null;
  if (saved && isUsable(saved)) return saved;

  const picked = pickVoiceFromCoverage(coverage, rnd);
  storage?.setItem(RUN_VOICE_KEY, picked);
  return picked;
}
