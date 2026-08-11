// 문체(voice) 변형 — 사건은 treatment 가 정본이고, 표현만 문체별로 갈린다. (#73)
//
// 설계 원칙 둘:
//  1) treatment(뼈대)는 **절대 화면에 나가지 않는다.** 변형이 없으면 기본 body 로 폴백한다.
//     뼈대가 노출되면 몰입이 통째로 깨지지만, 기본 body 는 그 자체로 완성된 문체다.
//  2) 랜덤 선택은 **완비된 문체만** 후보로 삼는다. 한 회차 안에서 목소리가 오가면 안 되므로.
//     미완비 문체는 수동 지정(미리보기)으로만 쓴다.

/** 기본 문체 — 씬의 body 를 그대로 쓴다. 항상 완비 상태다. */
export const DEFAULT_VOICE = 'default';

/** 문체 조립에 필요한 최소 형태(모델·lean 결과 양쪽을 받는다). */
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

/** 이 씬을 요청한 문체로 렌더할 본문. 없으면 기본 body(뼈대 아님). */
export function resolveBody(scene: VoicedScene, voice: string = DEFAULT_VOICE): string[] {
  if (voice && voice !== DEFAULT_VOICE) {
    const v = variantOf(scene, voice);
    if (v) return v;
  }
  return scene.body;
}

/** 문체별로 몇 개 씬을 채웠는지. CMS 진행률·랜덤 후보 판정에 쓴다. */
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

/** 존재하는 문체 목록 — 기본이 맨 앞, 나머지는 이름순. */
export function listVoices(scenes: VoicedScene[]): string[] {
  const names = Object.keys(voiceCoverage(scenes)).sort();
  return [DEFAULT_VOICE, ...names.filter((n) => n !== DEFAULT_VOICE)];
}

/**
 * 회차 시작 시 쓸 문체를 고른다. 완비된 변형 + 기본 문체 중에서만 뽑는다.
 * @param rnd 0<=x<1 (테스트에서 주입)
 */
export function pickVoice(scenes: VoicedScene[], rnd: () => number = Math.random): string {
  const cov = voiceCoverage(scenes);
  const candidates = [
    DEFAULT_VOICE,
    ...Object.entries(cov)
      .filter(([voice, c]) => c.complete && voice !== DEFAULT_VOICE)
      .map(([voice]) => voice)
      .sort(),
  ];
  const i = Math.min(candidates.length - 1, Math.max(0, Math.floor(rnd() * candidates.length)));
  return candidates[i];
}
