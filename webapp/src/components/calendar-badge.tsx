'use client';

// 헤더 달력 배지 (#328).
//
// 알림 종(notification-bell.tsx)과 같은 방침 — navbar 는 595줄에 데스크톱·모바일 마크업이
// 두 벌이라, 여기서 자기완결로 끝내야 navbar 변경이 한 줄로 끝난다.
//
// 로그인 없이도 보인다. 공휴일은 누구에게나 공휴일이다.

import { useEffect, useRef, useState } from 'react';
import { seoulDateKey } from '@/lib/birthday';
import type { CalendarEvent, EventKind } from '@/lib/calendar/types';

/** 조회한 KST 날짜. 하루 1회만 부르려고 둔다(생일 기능과 같은 방식). */
export const CALENDAR_CHECKED_KEY = 'calendar-checked';
const CACHED_EVENTS_KEY = 'calendar-events';

/**
 * 종류별 시각적 무게.
 *
 * 24절기까지 표시하면 연 80일 넘게 뜬다. 다 같은 무게로 그리면 특별한 날이 아니라 장식이
 * 되므로, 아이콘으로 *무슨 날인지*를 알리고 무게로 *얼마나 중요한지*를 알린다.
 */
const WEIGHT: Record<EventKind, string> = {
  holiday: 'text-base opacity-100',
  anniversary: 'text-sm opacity-90',
  season: 'text-xs opacity-60 grayscale',
};

const MAX_ICONS = 3;

export default function CalendarBadge() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const today = seoulDateKey(new Date());

    // 오늘 이미 확인했으면 네트워크를 타지 않는다. 결과까지 같이 들고 있어야, 페이지를
    // 옮길 때마다 배지가 사라졌다 나타나지 않는다.
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

  // Esc·바깥 클릭으로 닫기 — navbar 의 드롭다운과 같은 방식.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onOutside = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [open]);

  // 해당 없는 날엔 자리도 차지하지 않는다.
  if (events.length === 0) return null;

  const label = events.map((e) => e.name).join(' · ');

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`오늘은 ${label}`}
        aria-expanded={open}
        aria-describedby={open ? 'calendar-tooltip' : undefined}
        onClick={() => setOpen((v) => !v)}
        // hover 만으로는 모바일에서 못 연다. click·focus 와 함께 셋 다 지원한다.
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="flex items-center gap-0.5 rounded px-1 py-0.5 leading-none hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        {events.slice(0, MAX_ICONS).map((e, i) => (
          <span key={`${e.name}-${i}`} className={WEIGHT[e.kind]} aria-hidden="true">
            {e.icon}
          </span>
        ))}
      </button>

      {open && (
        <div
          id="calendar-tooltip"
          role="tooltip"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg bg-gray-800 p-3 text-left text-sm text-gray-100 shadow-xl ring-1 ring-white/10"
        >
          <ul className="space-y-2">
            {events.map((e, i) => (
              <li key={`${e.name}-${i}`}>
                <p className="font-semibold">
                  <span aria-hidden="true">{e.icon}</span> {e.name}
                </p>
                {/* 표에 없는 이름은 설명이 없다. 이름만이라도 반드시 보여준다. */}
                {e.description && <p className="mt-0.5 text-gray-300">{e.description}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
