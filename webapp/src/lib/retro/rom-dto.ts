// A RetroRom document into the shape sent to the client (#109).
//
// Three routes (list, upload and page) use the same conversion, so it lives in one place. The essential part is
// **never including `objectKey`** - a leaked MinIO key is a lead for bypassing the authenticated proxy.

import type { RomPatchDto, UserRomDto } from './entry';
import type { PlatformId } from './platforms';

export interface LeanRom {
  _id: unknown;
  title: string;
  platform: string;
  size: number;
  createdAt?: Date;
  filename?: string;
  patches?: LeanPatch[];
  patchEnabled?: boolean;
  coverKey?: string;
  parentSets?: { name: string; size: number; objectKey: string; sha256?: string }[];
  /** The file content's sha256 (#188) - the basis for separating netplay rooms. Older documents lack it. */
  sha256?: string;
}

export interface LeanPatch {
  _id: unknown;
  name: string;
  format: string;
  size: number;
  objectKey?: string;
  /** The file content's sha256 (#188). */
  sha256?: string;
  isDeleted?: boolean;
  createdAt?: Date;
}

/** One patch as exposed to the UI (#112). objectKey is absent here too. */
export interface UserPatchDto {
  id: string;
  name: string;
  format: string;
  size: number;
  createdAt: string;
}

export function toPatchDto(doc: LeanPatch): UserPatchDto {
  return {
    id: String(doc._id),
    name: doc.name,
    format: doc.format,
    size: doc.size,
    createdAt: (doc.createdAt ?? new Date(0)).toISOString(),
  };
}

/** Only the undeleted patches, in upload order. */
export function livePatches(doc: { patches?: LeanPatch[] }): UserPatchDto[] {
  return (doc.patches ?? []).filter((p) => !p.isDeleted).map(toPatchDto);
}

/**
 * The patch currently in use (#116).
 *
 * Even with several alive in the array it takes **the last one** - uploading replaces, so normally there is only one,
 * but when old data or a race leaves several, "the most recently uploaded" is the right answer.
 */
export function activePatch(doc: { patches?: LeanPatch[] }): RomPatchDto | undefined {
  const last = activeLeanPatch(doc);
  if (!last) return undefined;
  return { id: String(last._id), name: last.name, format: last.format, size: last.size };
}

/**
 * The raw patch chosen by **the same rule** as above - for when a value not exposed to the UI, such as the hash, is needed (#188).
 * Two different selection rules would put the netplay room out of step with the UI.
 */
export function activeLeanPatch(doc: { patches?: LeanPatch[] }): LeanPatch | undefined {
  const live = (doc.patches ?? []).filter((p) => !p.isDeleted);
  return live[live.length - 1];
}

export function toRomDto(doc: LeanRom, extra?: { hasSave?: boolean }): UserRomDto {
  return {
    id: String(doc._id),
    title: doc.title,
    platform: doc.platform as PlatformId,
    size: doc.size,
    createdAt: (doc.createdAt ?? new Date(0)).toISOString(),
    // Used by arcade to identify the game (#139).
    filename: doc.filename,
    patch: activePatch(doc),
    // An older document with no value counts as on - having uploaded a patch, it was meant to be used.
    patchEnabled: doc.patchEnabled !== false,
    hasSave: extra?.hasSave ?? false,
    // Served only through the authenticated proxy - the object key is not included.
    coverUrl: doc.coverKey ? `/api/games/retro/roms/${String(doc._id)}/cover` : undefined,
    // **Only the name** is exposed, not the object key - the address is built from the name.
    parentSets: (doc.parentSets ?? []).map((p) => p.name),
  };
}

/**
 * Whether it has the shape of a mongo ObjectId.
 *
 * Putting any old string into `findOne({_id})` makes mongoose throw a CastError and return 500.
 * A malformed id should be a 404, not a 500 - so the shape is checked first.
 */
export function isRomId(id: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(id);
}
