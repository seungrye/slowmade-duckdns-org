"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Download, FileDiff, Image as ImageIcon, ImagePlus, Pencil, Save } from "lucide-react";
import type { GameEntry } from "@/lib/retro/entry";
import { platformById } from "@/lib/retro/platforms";
import { normalizeRomTitle } from "@/lib/retro/rom-edit";

/**
 * The **shared shape** of the badges over the cover (#120).
 *
 * Why the height is a fixed value: the line height differs depending on whether the content is text (10px) or an
 * icon (11px), so matching the padding alone leaves them a pixel out when placed side by side. Only the horizontal padding varies.
 */
const BADGE =
  "inline-flex h-[18px] items-center rounded bg-black/60 text-[10px] font-semibold leading-none tracking-wide text-white";

/** The control buttons below the cover - a translucent background keeps them visible over a dark picture. */
const TOOL =
  "inline-flex h-6 items-center justify-center rounded bg-black/65 text-white/90 backdrop-blur-sm transition hover:bg-black/85 hover:text-white disabled:opacity-50";

/**
 * An icon-only button - square.
 *
 * **Never use it for a button with text.** It pins the width to 24px, so the text overflows to the right
 * and looks cramped (which is exactly what happened in #127).
 */
const TOOL_ICON = `${TOOL} w-6`;

/** Icon plus text - the width follows the content and only the horizontal padding is set. */
const TOOL_LABEL = `${TOOL} gap-1 px-1.5`;

interface Props {
  game: GameEntry;
  /** Given only for uploaded ROMs - a bundled game cannot be deleted. */
  onDelete?: (game: GameEntry) => void;
  /** Called when a patch file is chosen. Uploading replaces the existing patch. */
  onPatchUpload?: (game: GameEntry, file: File) => void;
  /** The checkbox - whether to actually apply the patch. */
  onPatchToggle?: (game: GameEntry, enabled: boolean) => void;
  /** Changes the card's picture. */
  onCoverUpload?: (game: GameEntry, file: File) => void;
  /** Edits the title. */
  onRename?: (game: GameEntry, title: string) => void;
  busy?: boolean;
}

/**
 * The library's cover card (#109, managed from the card in #116 and #122).
 *
 * With no cover it draws a tile of the title's first character over the system's colour gradient. Homebrew often has
 * no official box art, and an uploaded ROM has none until one is added.
 *
 * **The management controls stay inside the card.** The whole card is the play link, so pressing them is stopped
 * from leaking into it (`preventDefault` plus `stopPropagation`).
 */
export default function GameCard({
  game,
  onDelete,
  onPatchUpload,
  onPatchToggle,
  onCoverUpload,
  onRename,
  busy,
}: Props) {
  const meta = platformById(game.platform);
  const initial = game.title.trim().charAt(0) || "?";
  const patchRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const isRom = game.source === "rom";
  const canManage = isRom && (onPatchUpload || onPatchToggle || onCoverUpload);

  useEffect(() => {
    if (editing) titleRef.current?.select();
  }, [editing]);

  /** The controls laid over the card - clicks are swallowed so they do not leak into the play link. */
  function swallow(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function commitTitle() {
    const next = normalizeRomTitle(titleRef.current?.value);
    setEditing(false);
    // An empty or unchanged name does nothing.
    if (next && next !== game.title) onRename?.(game, next);
  }

  return (
    <div className="group relative">
      <Link
        href={game.playHref}
        className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-gray-100 shadow-sm ring-1 ring-gray-200 transition duration-200 group-hover:-translate-y-1 group-hover:shadow-lg dark:bg-gray-800 dark:ring-gray-700">
          {game.cover ? (
            // next/image is not used - a bundled cover is a local public file, and an uploaded cover is a private path
            // requiring authentication, which the optimisation server cannot fetch on our behalf.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={game.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${meta?.accent ?? "from-gray-400 to-gray-600"}`}
            >
              <span className="text-5xl font-bold text-white/90 drop-shadow">{initial}</span>
            </div>
          )}

          {/*
            기종과 세이브는 뜻이 다르니 배지도 따로 둔다 (#120) — 한 칸에 넣으면 "MD 저장" 처럼
            하나의 이름으로 읽힌다. 대신 높이를 `BADGE` 로 못 박아 나란히 맞춘다.
          */}
          <div className="absolute left-2 top-2 flex items-center gap-1">
            <span className={`${BADGE} px-1.5`}>{meta?.label ?? game.platform}</span>

            {game.hasSave && (
              <span className={`${BADGE} px-1`} title="저장된 상태가 있습니다">
                <Save size={11} aria-label="저장된 상태 있음" role="img" />
              </span>
            )}
          </div>

          {canManage && (
            // The patch bottom left, the cover bottom right. Mobile has no hover, so they are **always visible**.
            // The hidden file input does not live here - see the comment below.
            <div onClick={swallow} className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-1">
              <div className="flex items-center gap-1">
                {/*
                  체크박스는 **늘 자리를 지킨다** (#127). 패치가 없으면 감추는 대신 비활성으로
                  둔다 — 패치를 올리고 나서 버튼 위치가 밀리지 않는다.
                */}
                <span className={TOOL_ICON}>
                  <input
                    type="checkbox"
                    checked={Boolean(game.patch) && game.patchEnabled !== false}
                    disabled={busy || !game.patch}
                    title={game.patch ? `${game.patch.name} 적용` : "패치를 올리면 켤 수 있습니다"}
                    aria-label={game.patch ? `${game.patch.name} 적용` : "적용할 패치 없음"}
                    onChange={(e) => onPatchToggle?.(game, e.target.checked)}
                    className="h-3.5 w-3.5 accent-blue-500 disabled:opacity-40"
                  />
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => patchRef.current?.click()}
                  title={game.patch ? `패치: ${game.patch.name} — 눌러서 교체` : "패치 파일 올리기"}
                  aria-label={game.patch ? `${game.title} 패치 교체` : `${game.title} 패치 올리기`}
                  className={TOOL_LABEL}
                >
                  <FileDiff size={12} aria-hidden />
                  {/* 아이콘만 있으면 무슨 버튼인지 모른다 — 형식(IPS·BPS·UPS)을 적어 준다. */}
                  <span className="text-[10px] font-semibold leading-none">
                    {game.patch ? game.patch.format.toUpperCase() : "패치"}
                  </span>
                </button>
              </div>

              {/* 오른쪽 묶음 (#196) — 부모가 `justify-between` 이라 자식이 셋이면 하나가
                  가운데로 밀린다. 내려받기·커버를 한 묶음으로 두어 오른쪽에 붙인다. */}
              <div className="flex items-center gap-1">
                {/* 내려받기 (#194) — **버튼이어야 한다** (#196).
                    이 영역은 `onClick={swallow}` 로 감싸여 있어(`preventDefault`+`stopPropagation`)
                    앵커의 기본 동작인 다운로드가 취소된다. 게다가 카드 전체가 `<Link>` 라 `<a>` 를
                    여기 두면 앵커 중첩이 되어 HTML 상으로도 잘못이다. 그래서 버튼으로 두고 우리가
                    직접 주소로 보낸다 — `Content-Disposition: attachment` 라 화면은 그대로 있고
                    파일만 내려온다. */}
                <button
                  type="button"
                  onClick={() => { window.location.href = `/api/games/retro/roms/${game.id}/download`; }}
                  title={
                    game.patch || (game.parentUrls?.length ?? 0) > 0
                      ? "롬과 패치를 한 파일로 묶어 내려받기"
                      : "롬 파일 내려받기"
                  }
                  aria-label={`${game.title} 내려받기`}
                  className={TOOL_ICON}
                >
                  <Download size={13} aria-hidden />
                </button>

                {/* 그림 아이콘은 그 자체로 뜻이 통한다 — 글자를 붙이지 않는다. */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => coverRef.current?.click()}
                  title={game.cover ? "카드 그림 바꾸기" : "카드 그림 넣기"}
                  aria-label={`${game.title} 카드 그림`}
                  className={TOOL_ICON}
                >
                  {game.cover ? <ImageIcon size={13} aria-hidden /> : <ImagePlus size={13} aria-hidden />}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center gap-1 px-0.5">
          {editing ? (
            <input
              ref={titleRef}
              defaultValue={game.title}
              disabled={busy}
              aria-label="제목"
              onClick={swallow}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                if (e.key === "Escape") setEditing(false);
              }}
              onBlur={commitTitle}
              className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-1 py-0.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            />
          ) : (
            <>
              <p
                className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-gray-100"
                title={game.title}
              >
                {game.title}
              </p>
              {onRename && isRom && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={(e) => {
                    swallow(e);
                    setEditing(true);
                  }}
                  aria-label={`${game.title} 이름 바꾸기`}
                  className="shrink-0 text-gray-400 opacity-0 transition hover:text-blue-600 focus:opacity-100 focus:outline-none group-hover:opacity-100 disabled:opacity-50 dark:hover:text-blue-400"
                >
                  <Pencil size={12} aria-hidden />
                </button>
              )}
            </>
          )}
        </div>
        {game.subtitle && (
          <p className="truncate px-0.5 text-xs text-gray-500 dark:text-gray-400">{game.subtitle}</p>
        )}
      </Link>

      {/*
        숨은 file input 은 **링크와 조작 영역 밖**에 둔다 (#125).

        `input.click()` 이 만드는 클릭도 평범하게 버블링된다. 조작 영역 안에 두면 위의
        `swallow` 가 그 클릭까지 `preventDefault` 해 **파일 선택창이 열리지 않는다.**
        `<Link>` 안에 두면 이번엔 앵커까지 올라가 페이지가 이동한다. 그래서 둘 다 벗어난
        카드 뿌리에 둔다. `display:none` 이라 자리는 차지하지 않는다.
      */}
      {canManage && (
        <>
          <input
            ref={patchRef}
            type="file"
            // No accept is set (#145). Accepting only `.ips,.bps,.ups` made **a zip bundle patch (#143)
            // entirely unselectable.** Rather than extend the list it was removed - the format check happens
            // through the magic bytes anyway, and mobile pickers handle extension filters poorly.
            aria-label={`${game.title} 패치 파일`}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPatchUpload?.(game, file);
              e.target.value = "";
            }}
          />
          <input
            ref={coverRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            aria-label={`${game.title} 커버 이미지`}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onCoverUpload?.(game, file);
              e.target.value = "";
            }}
          />
        </>
      )}

      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            swallow(e);
            onDelete(game);
          }}
          disabled={busy}
          aria-label={`${game.title} 삭제`}
          className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white opacity-0 transition hover:bg-red-600 focus:opacity-100 focus:outline-none group-hover:opacity-100 disabled:opacity-50"
        >
          {busy ? "…" : "삭제"}
        </button>
      )}
    </div>
  );
}
