// EmulatorJS 를 띄우는 iframe 주소 만들기 (#109).
//
// 왜 iframe 인가: EmulatorJS 는 `EJS_*` **전역 변수**를 읽고 스스로 script·CSS·DOM 을 주입하는
// 구식 로더다. Next.js 클라이언트 라우팅에서 직접 마운트하면 라우트를 오갈 때 전역과 DOM 이 남아
// 두 번째 실행이 깨진다. 정적 player.html 을 iframe 으로 띄우면 전역 오염이 그 안에 갇히고,
// 화면을 떠날 때 iframe 이 사라지면서 통째로 정리된다.

import { SUPPORTED_CORES } from './platforms';
import { gameNumberOf } from './game-number';

export const PLAYER_PATH = '/games/retro/player.html';

export interface PlayerUrlOptions {
  /** EmulatorJS 코어명. PLATFORMS 에 등록된 것만 허용. */
  core: string;
  /** 롬 주소 — 같은 출처의 절대경로 또는 blob: URL. */
  rom: string;
  /** 플레이어 화면에 띄울 이름. */
  name?: string;
  /** 적용할 패치 주소 (#112). 롬과 같은 출처 제약을 받는다. */
  patch?: string;
  /**
   * SFC 512 바이트 헤더를 떼고 패치할지 (#112).
   *
   * 지정하지 않으면 플레이어가 판단한다 — BPS·UPS 는 CRC 로 맞는 쪽을 자동으로 찾고,
   * IPS 는 검증값이 없어 관행(헤더가 보이면 떼기)을 따른다. 사용자가 뒤집을 때만 실어 보낸다.
   */
  stripHeader?: boolean;
  /**
   * 세이브를 매달 게임 키 (#114) — `builtin:<slug>` 또는 `rom:<id>`.
   * 주면 플레이어가 네이티브 Save/Load 버튼을 서버로 돌린다. 없으면 저장 기능이 붙지 않는다.
   */
  saveKey?: string;
  /** 코어에 함께 놓을 부모 롬셋 주소들 (#143) — 일반적인 것부터. */
  parents?: string[];
  /**
   * 옛 이름으로 남은 게임 세이브를 되살릴지 (#175).
   *
   * 판단은 서버가 한다(`entry.ts` 의 `ROM_URL_CHANGED_AT`) — 옛 이름 `file.srm` 은 게임끼리
   * 공유하던 자리라, 아무 게임이나 가져가면 남의 세이브를 끌어오게 된다.
   */
  legacySave?: boolean;
  /**
   * netplay 로 열지 (#186). 켜면 플레이어가 `EJS_gameID`·`EJS_netplayServer` 를 세팅한다.
   *
   * 방을 가르는 것은 `gameID` 다 — 두 PC 가 **같은 게임 키**로 열어야 같은 방이 된다.
   */
  netplay?: boolean;
  /** netplay 방을 가르는 게임 키(`rom:<id>` 등). netplay 를 켤 때만 쓴다. */
  gameKeyForNetplay?: string;
}

/**
 * @throws 코어가 화이트리스트 밖이거나 롬·패치 주소가 외부 출처면 던진다.
 *   iframe 은 우리 오리진에서 도는 코드라, 여기로 임의 URL 이 새 나가면 남의 서버 파일을
 *   우리 플레이어로 트는 통로가 된다.
 */
export function buildPlayerUrl({ core, rom, name, patch, stripHeader, saveKey, parents, legacySave, netplay, gameKeyForNetplay }: PlayerUrlOptions): string {
  if (!SUPPORTED_CORES.has(core)) throw new Error(`지원하지 않는 코어: ${core || '(빈 값)'}`);
  if (!rom) throw new Error('롬 주소가 비었습니다.');
  if (!isSameOriginRom(rom)) throw new Error(`외부 출처 롬은 실행하지 않습니다: ${rom}`);
  if (patch && !isSameOriginRom(patch)) {
    throw new Error(`외부 출처 패치는 적용하지 않습니다: ${patch}`);
  }

  const params = new URLSearchParams({ core, rom });
  if (name) params.set('name', name);
  if (patch) {
    params.set('patch', patch);
    if (typeof stripHeader === 'boolean') params.set('strip', stripHeader ? '1' : '0');
  }
  if (saveKey) params.set('save', saveKey);
  if (legacySave) params.set('legacy', '1');
  if (netplay) {
    params.set('np', '1');
    // 게임 번호는 서버에서 계산해 싣는다 — 두 PC 가 같은 수를 봐야 같은 방이 된다.
    params.set('gid', String(gameNumberOf(gameKeyForNetplay || saveKey || rom)));
  }
  // 넘긴 순서를 그대로 지킨다 — URLSearchParams 는 넣은 순서를 보존한다.
  for (const p of parents ?? []) {
    if (!isSameOriginRom(p)) throw new Error(`외부 출처 롬셋은 쓰지 않습니다: ${p}`);
    params.append('set', p);
  }
  return `${PLAYER_PATH}?${params.toString()}`;
}

/**
 * 같은 출처인가. `/` 로 시작하는 절대경로만 허용하되 `//host` (프로토콜 상대 URL)는 막는다 —
 * 그건 외부 호스트다. 내 컴퓨터 롬 바로 열기용 `blob:` 은 브라우저가 만든 것이라 허용.
 */
function isSameOriginRom(rom: string): boolean {
  if (rom.startsWith('blob:')) return true;
  return rom.startsWith('/') && !rom.startsWith('//');
}
