// web-adventure 오디오 재생 버스 — HTMLAudioElement 래퍼.
//   BGM: 단일 트랙, 씬 전환에도 지속(같은 src 면 재시작 안 함).
//   SFX: 원샷(호출마다 새 엘리먼트).
// 부수효과를 한곳에 모아 테스트 가능하게 Audio 팩토리를 주입한다. 재생 실패
// (jsdom 미구현·브라우저 autoplay 차단)는 삼킨다 — 오디오 때문에 렌더가 죽지 않게.

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

  /** BGM 재생. 같은 트랙이 이미 걸려 있으면 재시작하지 않고 이어/재개한다(씬 전환 연속성). */
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

  /** 효과음 원샷 — 호출마다 새 엘리먼트(겹쳐 재생 허용). */
  playSfx(src: string, volume?: number): void {
    if (!src) return;
    const el = this.factory(src);
    if (volume !== undefined) el.volume = volume;
    this.safePlay(el);
  }

  /** 정리(플레이 종료 시) — BGM 정지. */
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
