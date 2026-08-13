// 고전 게임 코너가 지원하는 기종 (#109).
//
// 여기 한 곳이 기종의 단일 출처다 — 라벨·EmulatorJS 코어·확장자·폴백 타일 색이 모두 이 배열에서
// 나온다. 기종을 늘릴 때는 이 배열에 한 줄 추가하고 `scripts/games/fetch-emulatorjs.sh` 의
// KEEP_CORES 에 같은 코어를 넣으면 된다(코어 파일을 안 받으면 실행 시점에 404 가 난다).
//
// N64·PS1 은 넣지 않는다 — 무겁고, PS1 은 BIOS 저작권이 걸린다.

export type PlatformId = 'snes' | 'cps2';

export interface PlatformMeta {
  id: PlatformId;
  /** 목록·배지에 쓰는 짧은 이름. */
  label: string;
  /** 정식 명칭 — 툴팁·상세 화면용. */
  fullName: string;
  /**
   * EmulatorJS `EJS_core` 값. 시스템 별칭('nes')이 아니라 **구체 코어명**을 쓴다 —
   * 별칭은 EmulatorJS 버전에 따라 다른 코어로 바뀔 수 있어 재현성이 떨어진다.
   */
  core: string;
  /** 소문자·점 포함. platformForFilename 이 이 형식을 전제로 비교한다. */
  extensions: string[];
  /** 커버 없는 카드의 폴백 타일 그라디언트(tailwind 클래스). */
  accent: string;
}

export const PLATFORMS: PlatformMeta[] = [
  {
    id: 'snes',
    label: 'SNES',
    fullName: '슈퍼 패미컴 / SNES',
    core: 'snes9x',
    extensions: ['.sfc', '.smc'],
    accent: 'from-violet-500 to-indigo-700',
  },
  {
    id: 'cps2',
    label: 'CPS2',
    fullName: '캡콤 플레이 시스템 2 (아케이드)',
    core: 'fbalpha2012_cps2',
    // 아케이드 롬은 zip 묶음이고 **zip 이름이 곧 게임 식별자**다(ssf2t.zip).
    // 그래서 이 기종만 원본 파일명을 그대로 살려 내려준다 — `entry.ts` 의 romFileUrl 참고.
    extensions: ['.zip'],
    accent: 'from-yellow-500 to-amber-700',
  },
];

/**
 * 아케이드 계열인가 (#139).
 *
 * EmulatorJS 는 코어가 arcade·mame 계열이면 롬을 **파일명 그대로** 가상 FS 에 쓴다.
 * 아케이드 코어는 그 이름으로 어느 게임인지 판단하므로, 이름을 바꾸면 못 찾는다.
 */
export function isArcade(platform: PlatformId | string | undefined): boolean {
  return platform === 'cps2';
}

/** 플레이어에 넘길 수 있는 코어 화이트리스트 — 임의 문자열 차단용. */
export const SUPPORTED_CORES: Set<string> = new Set(PLATFORMS.map((p) => p.core));

export function platformById(id: PlatformId | string | undefined): PlatformMeta | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

/**
 * 파일명 확장자로 기종을 추론한다. 모르면 undefined — 호출측이 사용자에게 직접 고르게 한다.
 *
 * `.bin`·`.zip` 은 일부러 어느 기종에도 넣지 않았다. 여러 기종이 공유하는 확장자라
 * 잘못 추론하면 "왜 안 돌아가지" 로 이어진다. 모른다고 말하고 고르게 하는 편이 낫다.
 */
export function platformForFilename(filename: string): PlatformMeta | undefined {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return undefined;
  const ext = filename.slice(dot).toLowerCase();
  return PLATFORMS.find((p) => p.extensions.includes(ext));
}

/** 업로드 <input accept=...> 에 쓸 확장자 전체. */
export const ALL_ROM_EXTENSIONS: string[] = PLATFORMS.flatMap((p) => p.extensions);
