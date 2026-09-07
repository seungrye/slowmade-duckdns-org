"use client";

import { useCallback, useMemo, useRef } from "react";
import { buildPlayerUrl } from "@/lib/retro/player-url";

interface Props {
  core: string;
  /** A same-origin absolute path or a blob: URL. */
  rom: string;
  name?: string;
  /** The address of the patch to apply (#112). Merging happens inside the iframe. */
  patch?: string;
  /** How to handle the SFC 512-byte header - the player decides when unset. */
  stripHeader?: boolean;
  /** The game key the save hangs on (#114). Given it, the Save/Load buttons use the server. */
  saveKey?: string;
  /** The parent ROM set addresses to place alongside the core (#143) - arcade split sets. */
  parents?: string[];
  /** Whether to restore a game save left under the old name (#175). The server decides. */
  legacySave?: boolean;
  /** Whether to open in play-together (netplay) mode (#186). */
  netplay?: boolean;
  /** The game key that separates netplay rooms - both PCs must use the same value to share a room. */
  gameKeyForNetplay?: string;
}

/**
 * The iframe holding EmulatorJS (#109).
 *
 * All this component does is build the address and put it in the iframe. It does not manage the emulator's
 * lifecycle - leaving the screen has React remove the iframe, and the globals, workers and audio inside go with
 * it. That is the reason for using an iframe.
 */
export default function EmulatorFrame({ core, rom, name, patch, stripHeader, saveKey, parents, legacySave, netplay, gameKeyForNetplay }: Props) {
  const src = useMemo(() => {
    try {
      return buildPlayerUrl({ core, rom, name, patch, stripHeader, saveKey, parents, legacySave, netplay, gameKeyForNetplay });
    } catch {
      return null;
    }
  }, [core, rom, name, patch, stripHeader, saveKey, parents, legacySave, netplay, gameKeyForNetplay]);

  const frameRef = useRef<HTMLIFrameElement | null>(null);

  /**
   * Focuses the iframe (#123).
   *
   * With focus on the outer document, the arrow keys **scroll the page** - the view slides up mid-game. Key events
   * do not cross an iframe boundary, so putting focus inside is the fix. It happens both after loading finishes and
   * when the user taps the screen.
   */
  const focusFrame = useCallback(() => {
    frameRef.current?.focus();
  }, []);

  if (!src) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        이 게임을 실행할 수 없습니다. 기종 또는 롬 주소가 올바르지 않습니다.
      </div>
    );
  }

  return (
    <div
      onMouseDown={focusFrame}
      onTouchStart={focusFrame}
      className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black shadow-lg"
    >
      <iframe
        // Using src as the key rebuilds the iframe when moving to another game (or another patch).
        // Reusing the same iframe leaves EmulatorJS holding the previous game's state.
        key={src}
        ref={frameRef}
        src={src}
        onLoad={focusFrame}
        title={name ?? "레트로 플레이어"}
        className="absolute inset-0 h-full w-full border-0"
        // gamepad - without it, a gamepad is not detected inside the iframe (Permissions Policy).
        allow="gamepad *; fullscreen"
        allowFullScreen
      />
    </div>
  );
}
