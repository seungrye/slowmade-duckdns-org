"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/common/modal";
import GameCard from "./GameCard";
import PlatformNav from "./PlatformNav";
import RomUploader from "./RomUploader";
import { builtinEntry, romEntry, type BuiltinGame, type GameEntry, type UserRomDto } from "@/lib/retro/entry";
import { countByPlatform, filterGames, type PlatformFilter } from "@/lib/retro/filter";

interface Props {
  builtins: BuiltinGame[];
  initialRoms: UserRomDto[];
  /** The emulator assets are not deployed on the server - an install notice is shown above the list. */
  assetsMissing?: boolean;
}

/**
 * The retro game library (#109).
 *
 * It shows the bundled homebrew and my uploaded ROMs as **one list**. The only difference is whether the card has a
 * delete button - search and the system filter apply without distinction (`lib/retro/entry.ts` aligns their shapes).
 */
export default function RetroLibrary({ builtins, initialRoms, assetsMissing }: Props) {
  const [roms, setRoms] = useState<UserRomDto[]>(initialRoms);
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  // The ROM awaiting a delete confirmation (#155). The card's delete button sits where a hand easily brushes it,
  // so one press must not be the end of it - it cannot be undone.
  const [pendingDelete, setPendingDelete] = useState<GameEntry | null>(null);
  // Only that card is locked while a patch upload or toggle is in flight.
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // My uploads come first - a just-uploaded ROM must be visible without scrolling.
  const entries = useMemo<GameEntry[]>(
    () => [...roms.map(romEntry), ...builtins.map(builtinEntry)],
    [roms, builtins],
  );

  const counts = useMemo(() => countByPlatform(entries), [entries]);
  const visible = useMemo(() => filterGames(entries, platform, query), [entries, platform, query]);

  /** The card's delete button - it asks for confirmation rather than deleting at once (#155). */
  function handleDelete(game: GameEntry) {
    if (game.source !== "rom") return;
    setPendingDelete(game);
  }

  async function confirmDelete() {
    const game = pendingDelete;
    if (!game) return;
    setDeleting(game.id);
    try {
      const res = await fetch(`/api/games/retro/roms/${game.id}`, { method: "DELETE" });
      if (res.ok) setRoms((prev) => prev.filter((r) => r.id !== game.id));
    } finally {
      setDeleting(null);
      setPendingDelete(null);
    }
  }

  /** Uploads a patch - the server replaces the existing one and turns applying on. */
  async function handlePatchUpload(game: GameEntry, file: File) {
    setError(null);
    setWorking(game.id);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("romId", game.id);
      const res = await fetch("/api/games/retro/rom-patch", { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message ?? "패치를 올리지 못했습니다.");
        return;
      }
      setRoms((prev) =>
        prev.map((r) => (r.id === game.id ? { ...r, patch: body.data, patchEnabled: true } : r)),
      );
    } catch {
      setError("업로드 중 문제가 생겼습니다.");
    } finally {
      setWorking(null);
    }
  }

  async function handlePatchToggle(game: GameEntry, enabled: boolean) {
    setError(null);
    setWorking(game.id);
    // The UI updates first and reverts on failure - a checkbox has to respond immediately.
    setRoms((prev) => prev.map((r) => (r.id === game.id ? { ...r, patchEnabled: enabled } : r)));
    try {
      const res = await fetch(`/api/games/retro/roms/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patchEnabled: enabled }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setRoms((prev) => prev.map((r) => (r.id === game.id ? { ...r, patchEnabled: !enabled } : r)));
      setError("패치 설정을 바꾸지 못했습니다.");
    } finally {
      setWorking(null);
    }
  }

  /** Changes the card's picture. The address stays the same while the content changes, so a cache-busting value is appended. */
  async function handleCoverUpload(game: GameEntry, file: File) {
    setError(null);
    setWorking(game.id);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/games/retro/roms/${game.id}/cover`, { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message ?? "커버를 올리지 못했습니다.");
        return;
      }
      setRoms((prev) =>
        prev.map((r) =>
          r.id === game.id ? { ...r, coverUrl: `${body.data.coverUrl}?v=${body.data.updatedAt}` } : r,
        ),
      );
    } catch {
      setError("업로드 중 문제가 생겼습니다.");
    } finally {
      setWorking(null);
    }
  }

  async function handleRename(game: GameEntry, title: string) {
    setError(null);
    setWorking(game.id);
    const before = game.title;
    // The UI updates first and reverts on failure.
    setRoms((prev) => prev.map((r) => (r.id === game.id ? { ...r, title } : r)));
    try {
      const res = await fetch(`/api/games/retro/roms/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setRoms((prev) => prev.map((r) => (r.id === game.id ? { ...r, title: before } : r)));
      setError("제목을 바꾸지 못했습니다.");
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="md:flex md:gap-8">
      <aside className="md:w-52 md:shrink-0">
        <PlatformNav variant="sidebar" value={platform} counts={counts} onChange={setPlatform} />
        <div className="mt-4 hidden md:block">
          <RomUploader onUploaded={(rom) => setRoms((prev) => [rom, ...prev])} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4 space-y-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="게임 이름으로 검색"
            aria-label="게임 검색"
            className="w-full min-w-0 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:ring-blue-800"
          />
          <PlatformNav variant="chips" value={platform} counts={counts} onChange={setPlatform} />
        </div>

        {error && (
          <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        {assetsMissing && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            에뮬레이터 파일이 서버에 아직 없습니다. 배포 호스트에서{" "}
            <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">bash scripts/games/fetch-emulatorjs.sh</code>{" "}
            를 실행해 주세요.
          </div>
        )}

        {visible.length > 0 ? (
          <ul
            aria-label="게임 목록"
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {visible.map((game) => (
              <li key={game.key}>
                <GameCard
                  game={game}
                  onDelete={game.source === "rom" ? handleDelete : undefined}
                  onPatchUpload={game.source === "rom" ? handlePatchUpload : undefined}
                  onPatchToggle={game.source === "rom" ? handlePatchToggle : undefined}
                  onCoverUpload={game.source === "rom" ? handleCoverUpload : undefined}
                  onRename={game.source === "rom" ? handleRename : undefined}
                  busy={deleting === game.id || working === game.id}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            {entries.length === 0
              ? "아직 게임이 없습니다. 롬을 올리면 여기에 나타납니다."
              : "조건에 맞는 게임이 없습니다. 검색어나 기종을 바꿔 보세요."}
          </div>
        )}

        <div className="mt-6 md:hidden">
          <RomUploader onUploaded={(rom) => setRoms((prev) => [rom, ...prev])} />
        </div>
      </div>

      {/* 삭제 확인 (#155) — 되돌릴 수 없으므로 한 번 더 묻는다. */}
      <Modal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="롬 삭제 확인"
      >
        <div className="text-gray-700 dark:text-gray-300">
          <p>
            <span className="font-semibold">{pendingDelete?.title}</span> 을(를) 삭제할까요?
          </p>
          <p className="mt-1 text-sm text-red-600">
            올린 롬 파일과 함께 붙여 둔 패치·커버·세이브도 사라집니다.
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setPendingDelete(null)}
            disabled={deleting !== null}
            aria-label="롬 삭제 취소"
            className="rounded-md bg-gray-200 px-4 py-2 text-gray-800 transition hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            취소
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleting !== null}
            aria-label="롬 삭제 확인"
            className="rounded-md bg-red-600 px-4 py-2 text-white transition hover:bg-red-700 disabled:bg-red-400"
          >
            {deleting !== null ? "삭제 중…" : "삭제"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
