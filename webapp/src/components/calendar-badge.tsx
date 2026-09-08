'use client';

// The header's calendar badge (#328).
//
// The same policy as the notification bell (notification-bell.tsx) - navbar holds two sets of markup, desktop and mobile,
// across 595 lines, so finishing self-contained here keeps the navbar change to one line.
//
// It shows without a login. A public holiday is a holiday for everyone.

import { useEffect, useRef, useState } from 'react';
import { seoulDateKey } from '@/lib/birthday';
import type { CalendarEvent, EventKind } from '@/lib/calendar/types';

/** The KST date checked. Kept so it is called once a day (the same approach as the birthday feature). */
export const CALENDAR_CHECKED_KEY = 'calendar-checked';
const CACHED_EVENTS_KEY = 'calendar-events';

/**
 * The colour per kind - holidays red (a day off), observances blue, solar terms achromatic.
 *
 * They are stacked, so weight cannot be shown by size (the one behind is hidden) and colour carries it instead.
 *
 * **But since the overlap went to 89.3% (#413), only the first slot's colour is visible in the stack.**
 * The rest are 2.8px threads whose colour cannot be made out. So colour now means something only in **the first slot and the tooltip**
 * - a price knowingly paid to save space. To see every kind, press for "show all".
 */
const TONE: Record<EventKind, string> = {
  holiday: 'bg-rose-600/90',
  anniversary: 'bg-sky-700/90',
  season: 'bg-gray-600/90',
};

/** The most slots actually drawn in the stack. Beyond that the last slot becomes +N. */
const VISIBLE = 3;

export default function CalendarBadge() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  /** The slot the mouse or focus is on. null means none.*/
  const [hovered, setHovered] = useState<number | null>(null);
  /** Opened by a press (mobile). On a device without hover it is the only way to open the tooltip. */
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const today = seoulDateKey(new Date());

    // Already checked today, so no network call. The result is held alongside it so the badge does not
    // disappear and reappear on every page change.
    try {
      if (localStorage.getItem(CALENDAR_CHECKED_KEY) === today) {
        const cached = localStorage.getItem(CACHED_EVENTS_KEY);
        if (cached) setEvents(JSON.parse(cached));
        return;
      }
    } catch {
      // localStorage 를 못 쓰면 그냥 매번 조회한다 — 가벼운 GET 이라 큰 부담이 아니다.
    }

    let cancelled = false;
    fetch('/api/calendar/today')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        const next: CalendarEvent[] = json?.data?.events ?? [];
        setEvents(next);
        try {
          localStorage.setItem(CALENDAR_CHECKED_KEY, today);
          localStorage.setItem(CACHED_EVENTS_KEY, JSON.stringify(next));
        } catch {
          /* 위와 같은 이유로 무시 */
        }
      })
      .catch(() => {
        // 달력 때문에 헤더가 깨지면 안 된다.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Closed by Escape or a click outside - the same approach as the navbar's dropdowns.
  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(false);
    };
    const onOutside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [pinned]);

  // On a day with none it takes up no space either.
  if (events.length === 0) return null;

  const shown = events.slice(0, VISIBLE);
  const overflow = events.length - shown.length;
  const open = hovered !== null || pinned;
  // With a slot pointed at, only that one; without (= opened by a tap on mobile), all of them.
  const listed = hovered !== null ? [events[hovered]] : events;

  /**
   * A press means "show all". On desktop you hover through them one by one and a press gives the whole set,
   * and on mobile, with no hover, a tap is the show-all.
   */
  const showAll = () => {
    setHovered(null);
    setPinned((v) => !v);
  };

  return (
    <div
      ref={rootRef}
      className="relative flex items-center"
      onMouseLeave={() => setHovered(null)}
    >
      <div className="flex items-center">
        {shown.map((event, i) => (
          <button
            key={`${event.name}-${i}`}
            type="button"
            aria-label={event.name}
            onMouseEnter={() => setHovered(i)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
            onClick={showAll}
            // Stacked, but with a ring drawing the boundary so the emoji do not blur together.
            // The ring's colour must match the navbar's background to look cut out.
            //
            // The overlap is **89.3% (-ml-[25px])** - done to save space in the navbar (#413).
            // 28.6% (-ml-2) 88px -> 60.7% 61px (#410) -> 36px now. 41% of the original.
            // Exactly 90% would be 25.2px, but a fractional px blurs the edges, so it is kept whole.
            //
            // **The price is written down** (it was chosen by drawing it): only the first slot shows, the rest are 2.8px
            // threads whose colour and +N count cannot be read, and the per-badge hover target is that narrow too.
            // Pointing is not quite dead - **a press means "show all"**, and mobile never had
            // hover and always used that route. Pointing was a bonus on desktop.
            style={{ zIndex: hovered === i ? 30 : shown.length - i }}
            className={`relative -ml-[25px] flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none ring-2 ring-gray-900 transition first:ml-0 focus:outline-none ${TONE[event.kind]} ${
              hovered === i ? 'scale-110 ring-white' : ''
            }`}
          >
            <span aria-hidden="true">{event.icon}</span>
          </button>
        ))}

        {overflow > 0 && (
          <button
            type="button"
            aria-label={`외 ${overflow}건 더 보기`}
            onMouseEnter={() => setHovered(null)}
            onFocus={() => setHovered(null)}
            onClick={showAll}
            style={{ zIndex: 0 }}
            className="relative -ml-[25px] flex h-7 w-7 items-center justify-center rounded-full bg-gray-700 text-xs font-semibold leading-none text-gray-100 ring-2 ring-gray-900 focus:outline-none focus-visible:ring-white"
          >
            +{overflow}
          </button>
        )}
      </div>

      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg bg-gray-800 p-3 text-left text-sm text-gray-100 shadow-xl ring-1 ring-white/10"
        >
          <ul className="space-y-2">
            {listed.map((event, i) => (
              <li key={`${event.name}-${i}`}>
                <p className="font-semibold">
                  <span aria-hidden="true">{event.icon}</span> {event.name}
                </p>
                {/* 표에 없는 이름은 설명이 없다. 이름만이라도 반드시 보여준다. */}
                {event.description && (
                  <p className="mt-0.5 text-gray-300">{event.description}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
