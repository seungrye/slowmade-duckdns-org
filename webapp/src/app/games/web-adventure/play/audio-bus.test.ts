import { describe, it, expect, vi } from "vitest";
import { AudioBus, type AudioEl } from "./audio-bus";

// vi.fn 핸들을 그대로 노출하려 반환 타입을 추론에 맡기고(교차 주석이 Mock 과 충돌),
// 팩토리 반환 시점에만 AudioEl 로 캐스팅한다(같은 객체라 loop/volume 변이가 그대로 보인다).
function makeFakeEl(src: string) {
  return { play: vi.fn(), pause: vi.fn(), loop: false, volume: 1, currentTime: 0, src };
}

/** 생성된 엘리먼트를 수집하는 버스 + 팩토리. */
function makeBus() {
  const els: ReturnType<typeof makeFakeEl>[] = [];
  const bus = new AudioBus((src) => {
    const el = makeFakeEl(src);
    els.push(el);
    return el as unknown as AudioEl;
  });
  return { bus, els };
}

describe("AudioBus — BGM", () => {
  it("playBgm 은 loop/volume 설정 후 play 호출", () => {
    const { bus, els } = makeBus();
    bus.playBgm("a.mp3", { loop: true, volume: 0.4 });
    expect(els).toHaveLength(1);
    expect(els[0].loop).toBe(true);
    expect(els[0].volume).toBe(0.4);
    expect(els[0].play).toHaveBeenCalledOnce();
  });

  it("loop 미지정 시 기본 true", () => {
    const { bus, els } = makeBus();
    bus.playBgm("a.mp3");
    expect(els[0].loop).toBe(true);
  });

  it("같은 src 재요청은 새 엘리먼트를 만들지 않고 이어 재생", () => {
    const { bus, els } = makeBus();
    bus.playBgm("a.mp3");
    bus.playBgm("a.mp3");
    expect(els).toHaveLength(1);
    expect(els[0].play).toHaveBeenCalledTimes(2); // 최초 + 재개
  });

  it("다른 src 로 바꾸면 이전 것을 멈추고 새로 재생", () => {
    const { bus, els } = makeBus();
    bus.playBgm("a.mp3");
    bus.playBgm("b.mp3");
    expect(els).toHaveLength(2);
    expect(els[0].pause).toHaveBeenCalled(); // 이전 정지
    expect(els[1].play).toHaveBeenCalledOnce();
  });

  it("stopBgm 은 pause + currentTime 0 후 상태 클리어", () => {
    const { bus, els } = makeBus();
    bus.playBgm("a.mp3");
    bus.stopBgm();
    expect(els[0].pause).toHaveBeenCalled();
    expect(els[0].currentTime).toBe(0);
    // stop 후 같은 src 를 다시 걸면 새 엘리먼트(이어재생 아님)
    bus.playBgm("a.mp3");
    expect(els).toHaveLength(2);
  });

  it("pause/resume 는 현재 BGM 을 pause/play", () => {
    const { bus, els } = makeBus();
    bus.playBgm("a.mp3"); // play 1
    bus.pauseBgm();
    bus.resumeBgm(); // play 2
    expect(els[0].pause).toHaveBeenCalledOnce();
    expect(els[0].play).toHaveBeenCalledTimes(2);
  });

  it("dispose 는 BGM 을 정지", () => {
    const { bus, els } = makeBus();
    bus.playBgm("a.mp3");
    bus.dispose();
    expect(els[0].pause).toHaveBeenCalled();
  });
});

describe("AudioBus — SFX", () => {
  it("playSfx 는 호출마다 새 엘리먼트로 원샷 재생", () => {
    const { bus, els } = makeBus();
    bus.playSfx("s.mp3");
    bus.playSfx("s.mp3");
    expect(els).toHaveLength(2);
    expect(els[0].play).toHaveBeenCalledOnce();
    expect(els[1].play).toHaveBeenCalledOnce();
  });

  it("playSfx volume 지정", () => {
    const { bus, els } = makeBus();
    bus.playSfx("s.mp3", 0.7);
    expect(els[0].volume).toBe(0.7);
  });
});

describe("AudioBus — 재생 실패는 삼킨다", () => {
  it("play 가 throw 해도 전파하지 않는다(jsdom·autoplay 차단)", () => {
    const bus = new AudioBus(() => ({
      play: vi.fn(() => { throw new Error("Not implemented"); }),
      pause: vi.fn(),
      loop: false, volume: 1, currentTime: 0, src: "",
    }) as unknown as AudioEl);
    expect(() => bus.playBgm("a.mp3")).not.toThrow();
    expect(() => bus.playSfx("s.mp3")).not.toThrow();
  });
});
