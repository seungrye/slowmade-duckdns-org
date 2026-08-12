"use client";

import Link from "next/link";
import type { GameEntry } from "@/lib/retro/entry";
import { platformById } from "@/lib/retro/platforms";

interface Props {
  game: GameEntry;
  /** 업로드한 롬에만 준다 — 기본 제공 게임은 지울 수 없다. */
  onDelete?: (game: GameEntry) => void;
  deleting?: boolean;
}

/**
 * 라이브러리의 커버 카드 (#109).
 *
 * 커버가 없으면 기종 색 그라디언트에 제목 첫 글자를 얹은 타일을 그린다. 홈브류는 공식 박스아트가
 * 없는 경우가 흔하고, 올린 롬은 아예 없다 — 빈 사각형보다 낫다.
 */
export default function GameCard({ game, onDelete, deleting }: Props) {
  const meta = platformById(game.platform);
  const initial = game.title.trim().charAt(0) || "?";

  return (
    <div className="group relative">
      <Link
        href={game.playHref}
        className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-gray-100 shadow-sm ring-1 ring-gray-200 transition duration-200 group-hover:-translate-y-1 group-hover:shadow-lg dark:bg-gray-800 dark:ring-gray-700">
          {game.cover ? (
            // next/image 를 쓰지 않는다 — 커버는 로컬 public 파일이고 크기가 제각각이라
            // 최적화 서버를 태울 이득이 없다.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={game.cover}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${meta?.accent ?? "from-gray-400 to-gray-600"}`}
            >
              <span className="text-5xl font-bold text-white/90 drop-shadow">{initial}</span>
            </div>
          )}

          <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
            {meta?.label ?? game.platform}
          </span>
        </div>

        <div className="mt-2 px-0.5">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100" title={game.title}>
            {game.title}
          </p>
          {game.subtitle && (
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{game.subtitle}</p>
          )}
        </div>
      </Link>

      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(game)}
          disabled={deleting}
          aria-label={`${game.title} 삭제`}
          className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white opacity-0 transition hover:bg-red-600 focus:opacity-100 focus:outline-none group-hover:opacity-100 disabled:opacity-50"
        >
          {deleting ? "…" : "삭제"}
        </button>
      )}
    </div>
  );
}
