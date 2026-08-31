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
 * 종류별 색.
 *
 * 겹쳐 쌓는 방식이라 크기로 무게를 나누면 뒤엣것이 앞엣것에 가려 안 보인다. 대신 색으로
 * 나눈다 — 공휴일은 붉게(쉬는 날), 기념일은 푸르게, 절기는 무채색으로.
 */
const TONE: Record<EventKind, string> = {
  holiday: 'bg-rose-600/90',
  anniversary: 'bg-sky-700/90',
  season: 'bg-gray-600/90',
};

/** 스택에 실제로 그리는 최대 개수. 넘으면 마지막 칸이 +N 이 된다. */
const VISIBLE = 3;

export default function CalendarBadge() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  /** 마우스·포커스가 짚은 칸. null 이면 아무것도 안 짚은 상태. */
  const [hovered, setHovered] = useState<number | null>(null);
  /** 눌러서 연 상태(모바일). hover 가 없는 기기에서 툴팁을 여는 유일한 길이다. */
  const [pinned, setPinned] = useState(false);
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

  // 해당 없는 날엔 자리도 차지하지 않는다.
  if (events.length === 0) return null;

  const shown = events.slice(0, VISIBLE);
  const overflow = events.length - shown.length;
  const open = hovered !== null || pinned;
  // 짚은 칸이 있으면 그것만, 없으면(=탭으로 연 모바일) 전부 보여준다.
  const listed = hovered !== null ? [events[hovered]] : events;

  /**
   * 누르면 "전부 보기". 데스크톱에선 hover 로 하나씩 보다가 누르면 전체가 되고,
   * 모바일은 hover 가 없어 탭이 곧 전체 보기가 된다.
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
            // 겹쳐 쌓되(-ml-2), 링으로 경계를 그어 이모지끼리 뭉개지지 않게 한다.
            // 링 색은 navbar 배경과 같아야 오려낸 것처럼 보인다.
            style={{ zIndex: hovered === i ? 30 : shown.length - i }}
            className={`relative -ml-2 flex h-7 w-7 items-center justify-center rounded-full text-sm leading-none ring-2 ring-gray-900 transition first:ml-0 focus:outline-none ${TONE[event.kind]} ${
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
            className="relative -ml-2 flex h-7 w-7 items-center justify-center rounded-full bg-gray-700 text-xs font-semibold leading-none text-gray-100 ring-2 ring-gray-900 focus:outline-none focus-visible:ring-white"
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
