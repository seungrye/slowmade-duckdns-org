// 기본 제공 홈브류 목록 (#109).
//
// 전부 [retrobrews](https://github.com/retrobrews) 가 모아 둔 **자유 배포 홈브류**다. 상용 롬은
// 넣지 않는다 — 개인 롬은 사용자가 직접 올려 자기만 보는 쪽(`RetroRom` 모델)으로 처리한다.
//
// 실제 파일은 저장소에 없다. `scripts/games/fetch-emulatorjs.sh` 가 여기 적힌 목록을 보고
// `public/games/retro/roms|covers/` 로 내려받는다. 그래서 **파일이 없는 항목은 화면에 뜨지 않는다**
// (`filterExistingBuiltins`) — 링크만 있고 안 돌아가는 카드를 보여 주느니 감추는 게 낫다.

import type { BuiltinGame } from './entry';

import gamesJson from './builtin-games.json';

/**
 * 목록은 **JSON 으로 둔다** — `scripts/games/fetch-emulatorjs.sh` 가 같은 파일을 읽어 롬·커버를
 * 내려받기 때문이다. TS 배열이면 셸에서 못 읽어 목록을 두 벌 관리하게 되고, 그러면 어긋난다.
 * 항목을 추가할 때는 JSON 한 곳만 고치면 화면과 내려받기가 함께 따라온다.
 *
 * 내려받는 주소는 `source`(retrobrews 저장소)에서 만든다 — 필드를 따로 두지 않는다.
 */
export const BUILTIN_GAMES: BuiltinGame[] = gamesJson as BuiltinGame[];

export function builtinBySlug(slug: string): BuiltinGame | undefined {
  return BUILTIN_GAMES.find((g) => g.slug === slug);
}

/**
 * 롬 파일이 실제로 있는 항목만 남긴다.
 *
 * 파일 존재 확인은 **주입받는다**(`exists`) — 이 모듈이 fs 를 직접 잡으면 클라이언트 번들과
 * 테스트가 같이 무거워진다. 서버 컴포넌트가 fs 로 감싼 함수를 넘긴다.
 */
export function filterExistingBuiltins(
  games: BuiltinGame[],
  exists: (relativePath: string) => boolean,
): BuiltinGame[] {
  return games.filter((g) => exists(`roms/${g.file}`));
}

/** 커버가 실제로 받아졌는지까지 반영한 사본 — 없으면 카드가 폴백 타일을 그린다. */
export function withExistingCovers(
  games: BuiltinGame[],
  exists: (relativePath: string) => boolean,
): BuiltinGame[] {
  return games.map((g) => (g.cover && exists(`covers/${g.cover}`) ? g : { ...g, cover: undefined }));
}
