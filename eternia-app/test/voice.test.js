// #87 - the app's random prose-style selection.
//
// The rules are the same as the web's (webapp/src/lib/web-adventure/voice.ts). The app is a vanilla JS bundle, so it
// shares no code and implements the same rules separately - out of step, the web and the app read the same run in
// different styles, so changing a rule means changing both.
import { describe, it, expect } from "vitest";
import { DEFAULT_VOICE, RUN_VOICE_KEY, pickVoiceFromCoverage, chooseRunVoice } from "../src/voice.js";

const cov = {
  tolkien: { filled: 3, total: 3, complete: true },
  prose: { filled: 2, total: 3, complete: false },
};

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
};

describe("pickVoiceFromCoverage", () => {
  it("완비된 문체와 기본 문체 중에서 고른다", () => {
    expect(pickVoiceFromCoverage(cov, () => 0.99)).toBe("tolkien");
    expect(pickVoiceFromCoverage(cov, () => 0)).toBe(DEFAULT_VOICE);
  });

  // Choosing an incomplete style makes an empty scene fall back to the default body and mixes styles within a run.
  it("완비되지 않은 문체는 후보에서 뺀다", () => {
    const only = { prose: { filled: 1, total: 3, complete: false } };
    expect(pickVoiceFromCoverage(only, () => 0.99)).toBe(DEFAULT_VOICE);
  });

  it("커버리지가 비어도 기본 문체", () => {
    expect(pickVoiceFromCoverage({}, () => 0.5)).toBe(DEFAULT_VOICE);
  });
});

describe("chooseRunVoice", () => {
  it("한 번 뽑은 문체는 그 판 내내 유지된다", () => {
    const s = mem();
    expect(chooseRunVoice({ coverage: cov, storage: s, rnd: () => 0.99 })).toBe("tolkien");
    expect(chooseRunVoice({ coverage: cov, storage: s, rnd: () => 0 })).toBe("tolkien");
  });

  it("저장된 문체가 더 이상 완비가 아니면 다시 뽑는다", () => {
    const s = mem();
    s.setItem(RUN_VOICE_KEY, "prose");
    expect(chooseRunVoice({ coverage: cov, storage: s, rnd: () => 0.99 })).toBe("tolkien");
  });

  it("기본 문체가 뽑혀도 저장해 유지한다", () => {
    const s = mem();
    expect(chooseRunVoice({ coverage: cov, storage: s, rnd: () => 0 })).toBe(DEFAULT_VOICE);
    expect(chooseRunVoice({ coverage: cov, storage: s, rnd: () => 0.99 })).toBe(DEFAULT_VOICE);
  });

  it("storage 가 없어도 동작한다", () => {
    expect(chooseRunVoice({ coverage: cov, rnd: () => 0.99 })).toBe("tolkien");
  });

  it("override 가 가장 우선한다", () => {
    const s = mem();
    expect(chooseRunVoice({ coverage: cov, override: "tolkien", storage: s, rnd: () => 0 }))
      .toBe("tolkien");
  });
});
