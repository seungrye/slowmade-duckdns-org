// 오디오 재생 버스 — HTMLAudioElement 래퍼.
//   BGM: 단일 트랙, 씬 전환에도 지속(같은 src 면 재시작 안 함). SFX: 원샷.
// MIRROR — webapp/src/app/games/web-adventure/play/audio-bus.ts. 재생 실패(미구현·autoplay
// 차단)는 삼킨다 — 오디오 때문에 렌더가 죽지 않게. factory 주입으로 테스트 가능.

const defaultFactory = (src) => new Audio(src);

export class AudioBus {
  constructor(factory) {
    this.factory = factory || defaultFactory;
    this.bgm = null;
    this.bgmSrc = null;
  }

  /** BGM 재생. 같은 트랙이면 재시작하지 않고 이어/재개(씬 전환 연속성). */
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

  /** 효과음 원샷 — 호출마다 새 엘리먼트(겹쳐 재생 허용). */
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
