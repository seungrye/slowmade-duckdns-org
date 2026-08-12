"use client";

import Link from "next/link";
import { useRef } from "react";
import type { GameEntry } from "@/lib/retro/entry";
import { platformById } from "@/lib/retro/platforms";

interface Props {
  game: GameEntry;
  /** 업로드한 롬에만 준다 — 기본 제공 게임은 지울 수 없다. */
  onDelete?: (game: GameEntry) => void;
  /** 패치 파일을 고르면 부른다. 올리면 기존 패치를 교체한다. */
  onPatchUpload?: (game: GameEntry, file: File) => void;
  /** 체크박스 — 패치를 실제로 적용할지. */
  onPatchToggle?: (game: GameEntry, enabled: boolean) => void;
  busy?: boolean;
}

/**
 * 라이브러리의 커버 카드 (#109, 카드에서 관리 #116).
 *
 * 커버가 없으면 기종 색 그라디언트에 제목 첫 글자를 얹은 타일을 그린다. 홈브류는 공식 박스아트가
 * 없는 경우가 흔하고, 올린 롬은 아예 없다 — 빈 사각형보다 낫다.
 *
 * **관리 요소는 카드 안에서 끝낸다** — 패치 칩·체크박스·세이브 점. 카드 전체가 플레이 링크라
 * 이것들을 누를 때 링크로 새지 않게 막는다(`preventDefault` + `stopPropagation`).
 */
export default function GameCard({ game, onDelete, onPatchUpload, onPatchToggle, busy }: Props) {
  const meta = platformById(game.platform);
  const initial = game.title.trim().charAt(0) || "?";
  const fileRef = useRef<HTMLInputElement>(null);
  const isRom = game.source === "rom";

  /** 카드 위에 얹힌 조작 — 클릭이 플레이 링크로 새지 않게 삼킨다. */
  function swallow(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

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
            <img src={game.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
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

          {/* 세이브가 있다는 표시. 자세한 건 보여 주지 않는다 — 있다는 것만 알면 된다. */}
          {game.hasSave && (
            <span
              title="저장된 상태가 있습니다"
              aria-label="저장된 상태 있음"
              className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-black/40"
            />
          )}

          {isRom && (onPatchUpload || onPatchToggle) && (
            // 좌하단 패치 칩. 커버가 어두운 그림일 수 있어 반투명 배경을 깐다.
            // 모바일엔 hover 가 없으므로 **항상 보인다**.
            <div
              onClick={swallow}
              className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 rounded-md bg-black/65 px-1.5 py-1 backdrop-blur-sm"
            >
              {game.patch ? (
                <>
                  <input
                    type="checkbox"
                    checked={game.patchEnabled !== false}
                    disabled={busy}
                    aria-label={`${game.patch.name} 적용`}
                    onChange={(e) => onPatchToggle?.(game, e.target.checked)}
                    className="h-3.5 w-3.5 shrink-0 accent-blue-500"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                    title={`${game.patch.name} — 눌러서 교체`}
                    className="min-w-0 flex-1 truncate text-left text-[11px] text-white/90 hover:text-white disabled:opacity-50"
                  >
                    {game.patch.name}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 text-left text-[11px] text-white/70 hover:text-white disabled:opacity-50"
                >
                  + 패치
                </button>
              )}

              <input
                ref={fileRef}
                type="file"
                accept=".ips,.bps,.ups"
                aria-label={`${game.title} 패치 파일`}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onPatchUpload?.(game, file);
                  e.target.value = "";
                }}
              />
            </div>
          )}
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
        // 세이브 점과 겹치지 않게 그 왼쪽에 둔다.
        <button
          type="button"
          onClick={(e) => {
            swallow(e);
            onDelete(game);
          }}
          disabled={busy}
          aria-label={`${game.title} 삭제`}
          className={`absolute top-2 ${game.hasSave ? "right-7" : "right-2"} rounded-full bg-black/60 px-2 py-0.5 text-xs text-white opacity-0 transition hover:bg-red-600 focus:opacity-100 focus:outline-none group-hover:opacity-100 disabled:opacity-50`}
        >
          {busy ? "…" : "삭제"}
        </button>
      )}
    </div>
  );
}
