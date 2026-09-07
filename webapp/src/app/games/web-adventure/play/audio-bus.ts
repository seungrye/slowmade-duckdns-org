// The web-adventure audio playback bus - a wrapper over HTMLAudioElement.
//   BGM: a single track that persists across scene changes (the same src never restarts).
//   SFX: one-shot (a new element per call).
// The side effects are gathered in one place and the Audio factory is injected for testability. A playback failure
// (unimplemented in jsdom, or blocked by the browser's autoplay policy) is swallowed - audio must not kill the render.

export type AudioEl = Pick<
  HTMLAudioElement,
  "play" | "pause" | "loop" | "volume" | "currentTime" | "src"
>;
export type AudioFactory = (src: string) => AudioEl;

const defaultFactory: AudioFactory = (src) => new Audio(src);

export class AudioBus {
  private factory: AudioFactory;
  private bgm: AudioEl | null = null;
  private bgmSrc: string | null = null;

  constructor(factory: AudioFactory = defaultFactory) {
    this.factory = factory;
  }

  /** Plays the BGM. If the same track is already loaded it resumes rather than restarting (continuity across scene changes). */
  playBgm(src: string, opts: { loop?: boolean; volume?: number } = {}): void {
    if (!src) return;
    if (this.bgmSrc === src && this.bgm) {
      this.resumeBgm();
      return;
    }
    this.stopBgm();
    const el = this.factory(src);
    el.loop = opts.loop ?? true;
    if (opts.volume !== undefined) el.volume = opts.volume;
    this.bgm = el;
    this.bgmSrc = src;
    this.safePlay(el);
  }

  stopBgm(): void {
    if (this.bgm) {
      this.safePause(this.bgm);
      try {
        this.bgm.currentTime = 0;
      } catch {
        /* jsdom 등 미구현 무시 */
      }
    }
    this.bgm = null;
    this.bgmSrc = null;
  }

  pauseBgm(): void {
    if (this.bgm) this.safePause(this.bgm);
  }

  resumeBgm(): void {
    if (this.bgm) this.safePlay(this.bgm);
  }

  /** A one-shot sound effect - a new element per call (overlapping playback allowed). */
  playSfx(src: string, volume?: number): void {
    if (!src) return;
    const el = this.factory(src);
    if (volume !== undefined) el.volume = volume;
    this.safePlay(el);
  }

  /** Cleanup (on leaving play) - stops the BGM. */
  dispose(): void {
    this.stopBgm();
  }

  private safePlay(el: AudioEl): void {
    try {
      const p = el.play() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === "function") p.catch(() => { /* autoplay 차단·미구현 무시 */ });
    } catch {
      /* jsdom 등 미구현 무시 */
    }
  }

  private safePause(el: AudioEl): void {
    try {
      el.pause();
    } catch {
      /* 무시 */
    }
  }
}
