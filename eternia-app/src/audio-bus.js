// The audio playback bus - a wrapper over HTMLAudioElement.
//   BGM: a single track that persists across scene changes (the same src never restarts). SFX: one-shot.
// MIRROR - webapp/src/app/games/web-adventure/play/audio-bus.ts. A playback failure (unimplemented, or blocked
// autoplay) is swallowed - audio must not kill the render. Injecting the factory keeps it testable.

const defaultFactory = (src) => new Audio(src);

export class AudioBus {
  constructor(factory) {
    this.factory = factory || defaultFactory;
    this.bgm = null;
    this.bgmSrc = null;
  }

  /** Plays the BGM. The same track resumes rather than restarting (continuity across scene changes). */
  playBgm(src, opts) {
    opts = opts || {};
    if (!src) return;
    if (this.bgmSrc === src && this.bgm) { this.resumeBgm(); return; }
    this.stopBgm();
    const el = this.factory(src);
    el.loop = opts.loop === undefined ? true : opts.loop;
    if (opts.volume !== undefined) el.volume = opts.volume;
    this.bgm = el; this.bgmSrc = src;
    this._safePlay(el);
  }
  stopBgm() {
    if (this.bgm) { this._safePause(this.bgm); try { this.bgm.currentTime = 0; } catch { /* 무시 */ } }
    this.bgm = null; this.bgmSrc = null;
  }
  pauseBgm() { if (this.bgm) this._safePause(this.bgm); }
  resumeBgm() { if (this.bgm) this._safePlay(this.bgm); }

  /** A one-shot sound effect - a new element per call (overlapping playback allowed). */
  playSfx(src, volume) {
    if (!src) return;
    const el = this.factory(src);
    if (volume !== undefined) el.volume = volume;
    this._safePlay(el);
  }

  dispose() { this.stopBgm(); }

  _safePlay(el) {
    try {
      const p = el.play();
      if (p && typeof p.catch === "function") p.catch(() => { /* autoplay/미구현 무시 */ });
    } catch { /* 무시 */ }
  }
  _safePause(el) { try { el.pause(); } catch { /* 무시 */ } }
}
