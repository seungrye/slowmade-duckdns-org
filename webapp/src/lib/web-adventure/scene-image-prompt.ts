// One more scene illustration per ending (#158) - building the prompt and drawing the scene (pure).
//
// A scene has an `illustration` (the primary) and `illustrations[]` (the variations), and on entry one is chosen
// deterministically from (run, scene). So merely adding one to the array means **the rendering needs no change** -
// the same scene wears a different face as the runs accumulate.

/**
 * Eternia's art style (#158).
 *
 * The wording was tuned by actually opening the existing illustrations. What they share: a dark navy and black
 * palette, ether energy glowing teal, flat and crisp shading, **a background with no figures**, and 1:1.
 *
 * **The place is not included.** It once went as far as "an industrial interior of pipes and riveted panels", but
 * that is some scenes' setting, not the art style. It forces an interior even onto forest and outdoor scenes,
 * producing pictures at odds with the body. The place is the scene body's to decide; this pins only medium, colour and mood.
 */
export const ETERNIA_ART_STYLE =
  'dark moody pixel art game background art, deep navy and black palette, ' +
  'glowing cyan ether light accents, flat crisp shading, atmospheric lighting, ' +
  'no people, no text, square composition';

/** The maximum length of the scene description put in the image prompt - longer makes the picture vaguer. */
const MAX_SCENE_CHARS = 400;

export interface SceneLike {
  id: string;
  title?: string;
  body?: string[];
  illustrations?: string[];
}

/**
 * Strips the editorial notation from the title.
 *
 * Real titles look like `Scene 02a-ii — Yeongsu's call`. The leading number is for the author, not material for the
 * picture - passed through, the model tries to draw the letters.
 */
function sceneTitle(title: string): string {
  return title.replace(/^\s*scene\s+\S+\s*[—–-]\s*/i, '').trim();
}

/** Strips the body's formatting - `*emphasis*` and line breaks mean nothing to an image prompt. */
function plain(text: string): string {
  return text
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The prompt for drawing one scene.
 *
 * Only the opening of the body is used rather than the whole thing. An illustration only has to show "what kind of
 * place this scene is", and including the dialogue and plot leaves the model with no thread to follow.
 */
export function buildScenePrompt(scene: SceneLike): string {
  const title = sceneTitle(plain(scene.title ?? ''));
  const body = (scene.body ?? []).map(plain).filter(Boolean).join(' ');
  const scene_ = `${title}. ${body}`.slice(0, MAX_SCENE_CHARS).trim();
  return `${scene_}. ${ETERNIA_ART_STYLE}`;
}

export interface PickOptions {
  /** At least 0 and below 1. Injected in tests. */
  rand: () => number;
  /** The cap on variations one scene may hold. Beyond it, it drops out of the candidates. */
  maxPerScene?: number;
}

/**
 * Picks the scene to add a picture to **at random**.
 *
 * Being fully random, a scene that already has three can be drawn (that is the intent - any scene gains faces).
 * A cap only stops one scene being drawn repeatedly until dozens pile up.
 */
export function pickSceneForImage<T extends SceneLike>(
  scenes: T[],
  opts: PickOptions,
): T | null {
  const cap = opts.maxPerScene ?? 8;
  const pool = scenes.filter((s) => (s.illustrations?.length ?? 0) < cap);
  if (pool.length === 0) return null;
  const i = Math.min(pool.length - 1, Math.floor(opts.rand() * pool.length));
  return pool[i];
}
