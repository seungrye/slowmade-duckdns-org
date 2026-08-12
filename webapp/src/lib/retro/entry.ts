// 라이브러리에 늘어놓을 항목 한 벌 (#109).
//
// 목록에는 성격이 다른 둘이 섞인다 — 저장소에 딸려 오는 **기본 제공 홈브류**와 사용자가
// **직접 올린 롬**. 화면·검색·필터가 둘을 구분하지 않아도 되도록 여기서 같은 모양으로 만든다.

import type { PlatformId } from './platforms';

export type GameSource = 'builtin' | 'rom';

export interface GameEntry {
  /** 목록 key — 출처를 포함해 두 목록을 합쳐도 충돌하지 않는다. */
  key: string;
  source: GameSource;
  id: string;
  title: string;
  platform: PlatformId;
  /** 커버 이미지 경로. 없으면 카드가 폴백 타일을 그린다. */
  cover?: string;
  /** 에뮬레이터가 받아 갈 롬 주소. 반드시 같은 출처(우리 서버)여야 한다. */
  romUrl: string;
  playHref: string;
  /** 카드 아래 작은 글씨 — 출처 또는 파일 크기. */
  subtitle?: string;
  /** 아래 셋은 업로드 롬에만 있다 (#116) — 카드가 패치 칩과 세이브 점을 그리는 데 쓴다. */
  patch?: RomPatchDto;
  patchEnabled?: boolean;
  hasSave?: boolean;
}

export interface BuiltinGame {
  slug: string;
  title: string;
  platform: PlatformId;
  /** `public/games/retro/roms/` 안의 파일명. */
  file: string;
  /** 커버 파일명(`public/games/retro/covers/`). 없으면 폴백 타일. */
  cover?: string;
  /** 받아온 곳 — 라이선스 확인용으로 화면에 노출한다. */
  source: string;
  license: string;
  description?: string;
}

export interface RomPatchDto {
  id: string;
  name: string;
  format: string;
  size: number;
}

export interface UserRomDto {
  id: string;
  title: string;
  platform: PlatformId;
  size: number;
  createdAt: string;
  /** 살아 있는 패치 — 롬당 최대 하나 (#116). */
  patch?: RomPatchDto;
  /** 패치를 적용할지. 카드의 체크박스가 뒤집는다. */
  patchEnabled?: boolean;
  /** 서버 세이브가 있는지 — 카드 모서리의 작은 점. */
  hasSave?: boolean;
}

export const BUILTIN_ROM_DIR = '/games/retro/roms';
export const BUILTIN_COVER_DIR = '/games/retro/covers';

export function builtinEntry(game: BuiltinGame): GameEntry {
  return {
    key: `builtin:${game.slug}`,
    source: 'builtin',
    id: game.slug,
    title: game.title,
    platform: game.platform,
    cover: game.cover ? `${BUILTIN_COVER_DIR}/${game.cover}` : undefined,
    romUrl: `${BUILTIN_ROM_DIR}/${game.file}`,
    playHref: `/games/retro/play/builtin/${game.slug}`,
    subtitle: game.license,
  };
}

export function romEntry(rom: UserRomDto): GameEntry {
  return {
    key: `rom:${rom.id}`,
    source: 'rom',
    id: rom.id,
    title: rom.title,
    platform: rom.platform,
    // 공개 /s3/ 경로를 쓰지 않는다 — 주소만 알면 남이 받아 갈 수 있다.
    // 올린 사람 본인만 통과하는 인증 프록시로만 내려준다.
    romUrl: `/api/games/retro/roms/${rom.id}/file`,
    playHref: `/games/retro/play/rom/${rom.id}`,
    subtitle: formatBytes(rom.size),
    patch: rom.patch,
    patchEnabled: rom.patchEnabled,
    hasSave: rom.hasSave,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  // 1.5 MB 처럼 한 자리까지 — 정수로 반올림하면 0 MB 가 나온다.
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
