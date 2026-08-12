// 서버에서 에뮬레이터 자산이 실제로 배치됐는지 본다 (#109).
//
// `public/games/retro/{data,roms,covers}/` 는 gitignore 라 배포 호스트에서
// `scripts/games/fetch-emulatorjs.sh` 를 돌려야 채워진다. 안 채워진 상태에서 카드만 보여 주면
// 눌렀을 때 검은 화면이 나오므로, 없는 것은 감추고 왜 없는지 알려 준다.
//
// 서버 전용 — 클라이언트 컴포넌트에서 import 하지 말 것(fs 를 잡는다).

import { existsSync } from "node:fs";
import { join } from "node:path";

/** `public/games/retro` 절대 경로. */
const RETRO_PUBLIC_DIR = join(process.cwd(), "public", "games", "retro");

/** `roms/foo.nes` 처럼 retro 디렉터리 기준 상대경로로 존재를 확인한다. */
export function retroAssetExists(relativePath: string): boolean {
  return existsSync(join(RETRO_PUBLIC_DIR, relativePath));
}

/** EmulatorJS 본체가 배치돼 있는가 — 로더 한 개만 보면 충분하다. */
export function emulatorAssetsInstalled(): boolean {
  return retroAssetExists("data/loader.js");
}
