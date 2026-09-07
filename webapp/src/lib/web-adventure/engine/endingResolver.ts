// The ending helper - extracting the EndingId from a GameState plus a shortcut for the metadata lookup.
// Week 4: EndingScreen uses this module to branch the colours and epilogue by ending kind.

import type { GameState } from "@/types/web-adventure";
import {
  endingsMeta,
  getEndingMeta as getEndingMetaBase,
  type EndingId,
  type EndingMeta,
} from "@/content/web-adventure/endings";

/**
 * Returns the endingId when the game has ended, or null outside the ended phase.
 *
 * The caller gets a narrowed EndingId safely (though an endingId outside the definitions passes through as a plain
 * string at run time - the UI handles the fallback).
 */
export function resolveEnding(state: GameState): EndingId | string | null {
  if (state.phase !== "ended") return null;
  return state.endingId;
}

/** The metadata lookup for the 6 endings. An undefined id returns the fallback metadata. */
export function getEndingMeta(id: string): EndingMeta {
  return getEndingMetaBase(id);
}

/** Checks in the UI whether an endingId is one of the 6 known endings. */
export function isKnownEnding(id: string): id is EndingId {
  return id in endingsMeta;
}
