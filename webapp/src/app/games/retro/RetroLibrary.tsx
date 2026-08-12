"use client";

import { useMemo, useState } from "react";
import GameCard from "./GameCard";
import PlatformNav from "./PlatformNav";
import RomUploader from "./RomUploader";
import { builtinEntry, romEntry, type BuiltinGame, type GameEntry, type UserRomDto } from "@/lib/retro/entry";
import { countByPlatform, filterGames, type PlatformFilter } from "@/lib/retro/filter";

interface Props {
  builtins: BuiltinGame[];
  initialRoms: UserRomDto[];
  /** 에뮬레이터 자산이 서버에 배치되지 않았다 — 목록 위에 설치 안내를 띄운다. */
  assetsMissing?: boolean;
}

/**
 * 고전 게임 라이브러리 (#109).
 *
 * 기본 제공 홈브류와 내가 올린 롬을 **한 목록**으로 보여 준다. 둘의 차이는 카드에 삭제 버튼이
 * 붙는지뿐 — 검색·기종 필터는 구분 없이 걸린다(`lib/retro/entry.ts` 가 모양을 맞춰 준다).
 */
export default function RetroLibrary({ builtins, initialRoms, assetsMissing }: Props) {
  const [roms, setRoms] = useState<UserRomDto[]>(initialRoms);
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  // 패치 업로드·토글이 도는 동안 그 카드만 잠근다.
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 내가 올린 것을 앞에 둔다 — 방금 올린 롬이 스크롤 없이 보여야 한다.
  const entries = useMemo<GameEntry[]>(
    () => [...roms.map(romEntry), ...builtins.map(builtinEntry)],
    [roms, builtins],
  );

  const counts = useMemo(() => countByPlatform(entries), [entries]);
  const visible = useMemo(() => filterGames(entries, platform, query), [entries, platform, query]);

  async function handleDelete(game: GameEntry) {
    if (game.source !== "rom") return;
    setDeleting(game.id);
    try {
      const res = await fetch(`/api/games/retro/roms/${game.id}`, { method: "DELETE" });
      if (res.ok) setRoms((prev) => prev.filter((r) => r.id !== game.id));
    } finally {
      setDeleting(null);
    }
  }

  /** 패치를 올린다 — 서버가 기존 것을 교체하고 적용을 켠다. */
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
    // 먼저 화면을 바꾸고, 실패하면 되돌린다 — 체크박스는 즉각 반응해야 한다.
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

  /** 카드 그림을 바꾼다. 주소는 그대로이고 내용만 바뀌므로 캐시를 깨는 값을 붙인다. */
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
    // 먼저 화면을 바꾸고, 실패하면 되돌린다.
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
    </div>
  );
}
