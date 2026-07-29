import { describe, it, expect, vi } from "vitest";
import { AudioBus } from "../src/audio-bus.js";

function makeBus() {
  const els = [];
  const bus = new AudioBus((src) => {
    const el = { src, play: vi.fn(), pause: vi.fn(), loop: false, volume: 1, currentTime: 0 };
    els.push(el);
    return el;
  });
  return { bus, els };
}

describe("AudioBus BGM", () => {
  it("playBgm 은 loop/volume 설정 후 play", () => {
    const { bus, els } = makeBus();
    bus.playBgm("a.mp3", { loop: true, volume: 0.4 });
    expect(els).toHaveLength(1);
    expect(els[0].loop).toBe(true);
    expect(els[0].volume).toBe(0.4);
    expect(els[0].play).toHaveBeenCalledOnce();
  });
  it("같은 src 재요청은 새 엘리먼트 없이 이어재생", () => {
    const { bus, els } = makeBus();
    bus.playBgm("a.mp3"); bus.playBgm("a.mp3");
    expect(els).toHaveLength(1);
    expect(els[0].play).toHaveBeenCalledTimes(2);
  });
  it("다른 src 는 이전 정지 + 새 재생", () => {
    const { bus, els } = makeBus();
    bus.playBgm("a.mp3"); bus.playBgm("b.mp3");
    expect(els).toHaveLength(2);
    expect(els[0].pause).toHaveBeenCalled();
    expect(els[1].play).toHaveBeenCalledOnce();
  });
  it("pause/resume/stop/dispose", () => {
    const { bus, els } = makeBus();
    bus.playBgm("a.mp3"); bus.pauseBgm(); bus.resumeBgm();
    expect(els[0].pause).toHaveBeenCalledOnce();
    expect(els[0].play).toHaveBeenCalledTimes(2);
    bus.dispose();
    expect(els[0].pause).toHaveBeenCalledTimes(2);
  });
});

describe("AudioBus SFX", () => {
  it("playSfx 는 호출마다 새 엘리먼트 원샷", () => {
    const { bus, els } = makeBus();
    bus.playSfx("s.mp3"); bus.playSfx("s.mp3");
    expect(els).toHaveLength(2);
    expect(els[0].play).toHaveBeenCalledOnce();
    expect(els[1].play).toHaveBeenCalledOnce();
  });
});

describe("AudioBus 재생 실패는 삼킨다", () => {
  it("play throw 해도 전파 안 함", () => {
    const bus = new AudioBus(() => ({ play: () => { throw new Error("x"); }, pause: vi.fn(), loop: false, volume: 1, currentTime: 0 }));
    expect(() => bus.playBgm("a.mp3")).not.toThrow();
    expect(() => bus.playSfx("s.mp3")).not.toThrow();
  });
});
