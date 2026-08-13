// 라이브러리에 늘어놓을 항목 한 벌 (#109).
//
// 목록에는 성격이 다른 둘이 섞인다 — 저장소에 딸려 오는 **기본 제공 홈브류**와 사용자가
// **직접 올린 롬**. 화면·검색·필터가 둘을 구분하지 않아도 되도록 여기서 같은 모양으로 만든다.

import { isArcade, platformById, type PlatformId } from './platforms';

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
  /** 함께 병합할 부모 롬셋 주소들 (#143). */
  parentUrls?: string[];
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
  /** 올릴 때의 원본 파일명 — 아케이드는 이 이름으로 게임을 식별한다 (#139). */
  filename?: string;
  /** 살아 있는 패치 — 롬당 최대 하나 (#116). */
  patch?: RomPatchDto;
  /** 패치를 적용할지. 카드의 체크박스가 뒤집는다. */
  patchEnabled?: boolean;
  /** 서버 세이브가 있는지 — 카드 모서리의 표시. */
  hasSave?: boolean;
  /** 사용자가 올린 커버 주소 (#122). 없으면 카드가 폴백 타일을 그린다. */
  coverUrl?: string;
  /** 함께 병합할 부모 롬셋 이름들 (#143) — 순서가 곧 병합 순서다. */
  parentSets?: string[];
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
    // 카드는 cover 가 있으면 그림을, 없으면 타일을 그린다 — 분기를 새로 만들 필요가 없다.
    cover: rom.coverUrl,
    // 공개 /s3/ 경로를 쓰지 않는다 — 주소만 알면 남이 받아 갈 수 있다.
    // 올린 사람 본인만 통과하는 인증 프록시로만 내려준다.
    romUrl: romFileUrl(rom),
    playHref: `/games/retro/play/rom/${rom.id}`,
    subtitle: formatBytes(rom.size),
    patch: rom.patch,
    patchEnabled: rom.patchEnabled,
    hasSave: rom.hasSave,
    parentUrls: (rom.parentSets ?? []).map(
      (n) => `/api/games/retro/roms/${rom.id}/set/${encodeURIComponent(n)}`,
    ),
  };
}

/**
 * 롬 파일 주소 (#137).
 *
 * 끝을 `<id>.<확장자>` 로 맺는다. **EmulatorJS 는 URL 의 마지막 조각을 브라우저 캐시(IndexedDB)
 * 키로 쓴다** — 예전처럼 모두 `.../file` 로 끝나면 키가 하나로 겹쳐, 바이트 크기가 같은 두 롬이
 * 있을 때 엉뚱한 게임이 뜰 수 있다. id 를 넣어 롬마다 키가 갈리게 한다.
 * 확장자는 코어가 쓰는 가상 파일명에도 그대로 붙는다.
 */
export function romFileUrl(rom: { id: string; platform: PlatformId; filename?: string }): string {
  // 아케이드는 **파일명이 곧 게임 이름**이다(ssf2t.zip). 바꾸면 코어가 롬을 못 찾는다.
  // 그 대신 캐시 키도 파일명으로 갈리는데, 같은 이름·같은 크기를 두 번 올리는 경우에만
  // 겹치므로 실질적인 위험은 없다.
  if (isArcade(rom.platform) && rom.filename) {
    return `/api/games/retro/roms/${rom.id}/file/${encodeURIComponent(rom.filename)}`;
  }
  const ext = platformById(rom.platform)?.extensions[0] ?? '.bin';
  return `/api/games/retro/roms/${rom.id}/file/${rom.id}${ext}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  // 1.5 MB 처럼 한 자리까지 — 정수로 반올림하면 0 MB 가 나온다.
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
