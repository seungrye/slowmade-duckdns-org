"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { GAME_ICONS, formatGameIconCodepoint, type GameIconsIcon } from "@/lib/game-icons-icons";

/**
 * game-icons.net 아이콘 선택 모달.
 *
 * - 검색어로 이름 부분 일치 필터링.
 * - 그리드에 아이콘 자체(game-icon 폰트) + 이름을 표시.
 * - 선택 시:
 *   · 기본: 단일 PUA 문자(String.fromCodePoint(cp)) — DB/API 가 그대로 저장하고
 *     export RON 직렬화 시 자동으로 `\u{XXXXX}` escape 로 출력된다.
 *   · `outputFormat="literal"` 옵션 시: `\u{XXXXX}` 문자열 직접.
 * - ESC / 백드롭 클릭 / 취소 버튼으로 닫힘.
 *
 * 4102 개 아이콘 그리드는 가벼운 가상화 (윈도 슬라이싱) 로 렌더 — 검색 전엔 상위
 * `LIMIT` 개만 그리고, "더 보기" 버튼/검색으로 좁힌다.
 */
export type IconPickerOutput = "char" | "literal";

export interface IconPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (value: string) => void;
  /** 모달 제목. 기본값: "아이콘 선택 (game-icons.net)" */
  title?: string;
  /** 출력 형식. 기본 "char" — 단일 PUA 문자. */
  outputFormat?: IconPickerOutput;
}

const INITIAL_LIMIT = 300;
const LIMIT_STEP = 300;

export function IconPickerDialog({ open, onClose, onSelect, title, outputFormat = "char" }: IconPickerDialogProps) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  const inputRef = useRef<HTMLInputElement>(null);

  // 모달 열릴 때 검색창에 자동 포커스 + 검색어/한도 초기화.
  useEffect(() => {
    if (open) {
      setQuery("");
      setLimit(INITIAL_LIMIT);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // 검색어 바뀌면 한도 리셋 (좁혀진 결과는 한도 없이 모두 표시).
  useEffect(() => { setLimit(INITIAL_LIMIT); }, [query]);

  // ESC 닫기.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo<GameIconsIcon[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GAME_ICONS.slice();
    return GAME_ICONS.filter((i) => i.name.includes(q));
  }, [query]);

  // 검색어가 있을 땐 한도 무시(보통 충분히 좁혀짐), 비었을 땐 점진 로드.
  const display = query.trim() ? filtered : filtered.slice(0, limit);
  const hasMore = !query.trim() && filtered.length > display.length;

  if (!open) return null;

  return (
    <div
      // 백드롭 — 클릭하면 닫힘.
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "아이콘 선택"}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden border"
      >
        <div className="p-3 border-b flex items-center gap-2">
          <h2 className="text-sm font-semibold flex-1">{title ?? "아이콘 선택 (game-icons.net)"}</h2>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded border hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="닫기"
          >
            닫기
          </button>
        </div>

        <div className="p-3 border-b">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="아이콘 이름 검색 (예: sword, shield, dragon)"
            className="w-full border rounded px-2 py-1 text-sm bg-white dark:bg-gray-800"
            aria-label="아이콘 검색"
          />
          <p className="mt-1 text-xs text-gray-500">
            {display.length} / {filtered.length} 개 표시 (총 {GAME_ICONS.length} 개)
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              일치하는 아이콘이 없습니다.
            </p>
          ) : (
            <>
              <ul
                className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1"
                role="listbox"
                aria-label="아이콘 목록"
              >
                {display.map((icon) => {
                  const literal = formatGameIconCodepoint(icon.codepoint);
                  const ch = String.fromCodePoint(icon.codepoint);
                  const value = outputFormat === "literal" ? literal : ch;
                  return (
                    <li key={icon.name}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(value);
                          onClose();
                        }}
                        className="w-full flex flex-col items-center gap-1 p-2 rounded border border-transparent hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors"
                        title={`${icon.name} (${literal})`}
                        aria-label={`${icon.name} 선택`}
                      >
                        <span
                          className="game-icon text-2xl"
                          aria-hidden="true"
                        >
                          {ch}
                        </span>
                        <span className="text-[10px] text-gray-500 break-all text-center leading-tight">
                          {icon.name}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hasMore && (
                <div className="flex justify-center py-3">
                  <button
                    type="button"
                    onClick={() => setLimit((n) => n + LIMIT_STEP)}
                    className="text-xs px-3 py-1 rounded border hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    더 보기 ({filtered.length - display.length} 남음)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
