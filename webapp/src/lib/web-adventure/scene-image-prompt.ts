// 엔딩마다 씬 삽화를 한 장 더 만든다 (#158) — 프롬프트 만들기와 씬 추첨(순수).
//
// 씬에는 `illustration`(대표) 과 `illustrations[]`(배리에이션)이 있고, 진입할 때 (회차+씬)로
// 결정적 선택해 보여 준다. 그래서 배열에 한 장 더 넣기만 하면 **렌더링은 손댈 것이 없다** —
// 회차를 거듭할수록 같은 씬이 다른 얼굴로 보인다.

/**
 * 에테르니아 화풍 (#158).
 *
 * 기존 삽화를 실제로 열어 보고 맞춘 문구다. 공통점: 어두운 남색·검정 팔레트, 청록으로 빛나는
 * 에테르 기운, 납작하고 또렷한 셰이딩, **인물 없는 배경화**, 1:1.
 *
 * **장소는 넣지 않는다.** 처음엔 "파이프·리벳 패널의 산업 실내"까지 넣었는데, 그건 화풍이
 * 아니라 일부 씬의 배경이다. 숲·야외 씬에까지 실내를 강제해 본문과 어긋난 그림이 나온다.
 * 장소는 씬 본문이 정하고, 여기서는 매체·색·분위기만 못 박는다.
 */
export const ETERNIA_ART_STYLE =
  'dark moody pixel art game background art, deep navy and black palette, ' +
  'glowing cyan ether light accents, flat crisp shading, atmospheric lighting, ' +
  'no people, no text, square composition';

/** 그림 프롬프트에 실을 장면 묘사의 최대 길이 — 길수록 그림이 흐려진다. */
const MAX_SCENE_CHARS = 400;

export interface SceneLike {
  id: string;
  title?: string;
  body?: string[];
  illustrations?: string[];
}

/**
 * 제목의 편집용 표기를 뗀다.
 *
 * 실제 제목이 `Scene 02a-ii — 영수의 부름` 처럼 되어 있다. 앞의 번호는 작가가 쓰는 것이지
 * 그림의 재료가 아니다 — 그대로 넘기면 모델이 글자를 그리려 든다.
 */
function sceneTitle(title: string): string {
  return title.replace(/^\s*scene\s+\S+\s*[—–-]\s*/i, '').trim();
}

/** 본문 서식을 걷어 낸다 — `*강조*`·줄바꿈은 그림 프롬프트에 의미가 없다. */
function plain(text: string): string {
  return text
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 씬 하나를 그릴 프롬프트.
 *
 * 본문을 그대로 넘기지 않고 앞부분만 쓴다. 삽화는 "그 장면이 어떤 곳인가"를 보여 주면 되고,
 * 대사·전개까지 넣으면 모델이 갈피를 못 잡는다.
 */
export function buildScenePrompt(scene: SceneLike): string {
  const title = sceneTitle(plain(scene.title ?? ''));
  const body = (scene.body ?? []).map(plain).filter(Boolean).join(' ');
  const scene_ = `${title}. ${body}`.slice(0, MAX_SCENE_CHARS).trim();
  return `${scene_}. ${ETERNIA_ART_STYLE}`;
}

export interface PickOptions {
  /** 0 이상 1 미만. 테스트에서 주입한다. */
  rand: () => number;
  /** 한 씬이 가질 수 있는 배리에이션 상한. 넘으면 후보에서 뺀다. */
  maxPerScene?: number;
}

/**
 * 그림을 더할 씬을 **무작위로** 고른다.
 *
 * 완전 무작위라 이미 3 장인 씬도 뽑힌다(그게 의도다 — 어느 씬이든 얼굴이 늘어난다).
 * 다만 한 씬만 계속 뽑혀 수십 장이 쌓이는 것은 막으려고 상한을 둔다.
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
