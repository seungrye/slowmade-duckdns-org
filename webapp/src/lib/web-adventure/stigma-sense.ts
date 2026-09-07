// Derived variables that make the contamination felt in the body (#370).
//
// The problem: the contamination (stigmaErosion) rises while **the body text never says so**. A run's feedback note
// made the same point twice, in two different runs - "contamination is at 100 and its physical and psychological
// effects are not shown enough", "the felt change at each stage should be described concretely".
//
// The solution: variables used in the body, such as `{{침식_손}}`, are **derived from the contamination**. The author
// places the variable in a sentence once, and the same sentence reads with a different weight each run.
//
//   "You take hold of the door handle. {{침식_손}}"
//     contamination 0   -> "Your fingertips are a little cold."
//     contamination 100 -> "Your stiffened fingers will not bend, so you push it open with the back of your hand."
//
// Why the senses split into hand, sight, breath and mind: with only one, the same sentence repeats scene after scene
// and soon reads like wallpaper. They are split so the sense that matches a scene's grain can be chosen.
//
// The renderer is untouched - these are simply added to the vars passed to `parseScript(body, vars)`.

/** The contamination stage - 0 (an unharmed body) to 4 (nearly crystalline). */
export type StigmaTier = 0 | 1 | 2 | 3 | 4;

/** Contamination -> stage. The boundaries match the 25-point spacing the existing contamination gates use (#368). */
export function stigmaTier(erosion: number): StigmaTier {
  const e = Number.isFinite(erosion) ? erosion : 0;
  if (e >= 100) return 4;
  if (e >= 75) return 3;
  if (e >= 50) return 2;
  if (e >= 25) return 1;
  return 0;
}

/** The senses per stage. The low end is unease, the high end loss of control. */
const SENSES: Record<string, [string, string, string, string, string]> = {
  // The hand - the crystallised right arm. The most frequently used sense.
  침식_손: [
    '손끝이 조금 시리다.',
    '손목의 결정이 스칠 때마다 잔가시처럼 걸린다.',
    '손가락 두 개가 제 뜻대로 접히지 않는다.',
    '팔꿈치까지 굳어, 힘을 주면 살갗 아래에서 유리 갈리는 소리가 난다.',
    '굳은 손가락이 접히지 않는다. 손등으로 밀어야 한다.',
  ],
  // Sight - the stage where the contamination begins to reach the eyes.
  침식_시야: [
    '가스등 불빛이 유난히 파랗게 번진다.',
    '눈꼬리에 푸른 잔상이 한 박자 늦게 따라붙는다.',
    '시야 가장자리에 검은 얼룩이 앉았다 사라진다.',
    '초점을 옮길 때마다 세상이 반 박자 늦게 따라온다.',
    '보이는 것의 절반이 푸른 결정 너머로 갈라져 보인다.',
  ],
  // Breath - the contamination inside the body. Used in quiet scenes.
  침식_숨: [
    '숨을 들이켤 때 쇳내가 옅게 섞인다.',
    '깊게 숨을 쉬면 갈비뼈 안쪽이 서늘하다.',
    '숨이 짧다. 두 번 들이켜야 한 번만큼 찬다.',
    '숨 끝마다 가슴 안쪽에서 얼음 밟는 소리가 난다.',
    '숨이 목 앞에서 얼어붙는다. 몸이 숨 쉬는 법을 잊어 간다.',
  ],
  // Mind - psychological pressure. Used before a decision.
  침식_마음: [
    '아직은 견딜 만하다고, 너는 생각한다.',
    '몸이 조금씩 남의 것이 되어 간다는 생각을 떨치기 어렵다.',
    '어디까지가 너이고 어디부터가 결정인지 헷갈리는 순간이 늘었다.',
    '결정이 너를 대신해 무언가를 결정하려 든다는 느낌이 든다.',
    '너는 이제 네가 남긴 자리에 서 있을 뿐이라는 생각이 든다.',
  ],
};

/**
 * The `{{variable}}` values derived from the contamination.
 *
 * Only the variables an author placed are used, so there is no need to use all of these.
 * An undefined variable is left as its original by `interpolate`, so a typo is not hidden.
 */
export function stigmaVars(erosion: number): Record<string, string> {
  const tier = stigmaTier(erosion);
  const out: Record<string, string> = { 침식단계: String(tier) };
  for (const [key, steps] of Object.entries(SENSES)) out[key] = steps[tier];
  return out;
}
