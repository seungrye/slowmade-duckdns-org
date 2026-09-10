'use client';

// 막의 지도 (#430 → #432) — 세로로 서고, 넘치면 스크롤한다.
//
// 처음엔 층을 가로로 눕히고 화면에 맞춰 줄였다. 412px 에서 노드가 너무 작아 읽히지 않았다.
// **작은 화면에 우겨넣을 이유가 없다** — 노드를 읽을 만한 크기로 두고 넘치는 만큼 스크롤한다.
// 그러면 "좁으면 세로 / 넓으면 가로" 두 벌을 만들 필요도 없어진다. 한 벌로 끝난다.
//
// 방향은 아래에서 위다. 지금 서 있는 자리가 아래에 있고 앞길이 위로 뻗는다 — 손이 닿는
// 곳에 현재가 있고, 스크롤은 앞을 내다보는 몸짓이 된다.
//
// **가로로는 안 넘친다** (#457). 세로로 넘치는 것은 앞을 내다보는 것이지만 가로로 넘치면
// 지도를 읽을 수 없다. 좌표는 컨테이너 폭에서 역산한다 — `map-geometry.ts`.
//
// 노드가 씬을 담고 있으면(`sceneId`) 제목을 그대로 쓴다. 「가솔린 열차」가 곧 그 조우의
// 이름이 되는 것이 이번 작업의 요지다.

import { useLayoutEffect, useRef, useState } from 'react';
import type { ActMap } from '@/lib/eternia-refine/map';
import type { MapNode, NodeKind } from '@/lib/eternia-refine/types';
import { clipLabel, mapGeometry } from './map-geometry';

const R = 15;

/** 폭을 재기 전에 쓸 값. 첫 프레임에만 보이고 곧 실제 폭으로 바뀐다. */
const FALLBACK_W = 360;

const LABEL: Record<NodeKind, string> = {
  start: '출발',
  battle: '전투',
  elite: '정예',
  refinery: '정제소',
  event: '사건',
  alliance: '동맹',
  boss: '보스',
};

export interface MapScreenProps {
  map: ActMap;
  at: string | null;
  open: MapNode[];
  onGo: (id: string) => void;
}

export function MapScreen({ map, at, open, onGo }: MapScreenProps) {
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(FALLBACK_W);

  // 폭이 바뀌면 좌표를 다시 잡는다 — 화면을 돌리거나 창을 줄일 때.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setBoxW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = Math.max(...map.nodes.map((n) => n.row)) + 1;
  const widths = Array.from({ length: rows }, (_, r) => map.nodes.filter((n) => n.row === r).length);
  const maxWide = Math.max(...widths);

  const g = mapGeometry(boxW, rows, maxWide);
  const w = g.width;
  const h = g.height;

  // 층이 위로 쌓이도록 y 를 뒤집는다 — 뿌리(row 0)가 맨 아래.
  // 층마다 칸 수가 다르므로 좁은 층은 가운데로 모은다.
  const place = (n: MapNode) => ({
    x: g.pad + ((maxWide - widths[n.row]) / 2 + n.col) * g.colGap,
    y: h - (h - (rows - 1) * g.rowGap) / 2 - n.row * g.rowGap,
  });

  const pos = new Map(map.nodes.map((n) => [n.id, place(n)]));
  const openIds = new Set(open.map((n) => n.id));

  return (
    <div className="flex flex-1 flex-col gap-3">
      <p className="text-sm text-amber-800">
        {at === null ? '어디로 들어갈지 고른다.' : '다음 길을 고른다.'}
      </p>

      {/* 세로만 스크롤한다 (#457). 가로는 폭에 맞춰 좌표를 잡으므로 넘칠 일이 없다. */}
      <div
        ref={box}
        className="flex-1 overflow-y-auto overflow-x-hidden rounded-md border border-amber-300 bg-amber-100/60"
      >
        <svg width={w} height={h} className="block" role="img" aria-label="지도">
          {map.nodes.flatMap((n) =>
            n.next.map((id) => {
              const a = pos.get(n.id)!;
              const b = pos.get(id)!;
              const live = at === n.id;
              return (
                <line
                  key={`${n.id}-${id}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={live ? '#B45309' : '#D4A24C'}
                  strokeWidth={live ? 3 : 2}
                  strokeDasharray={live ? undefined : '5 5'}
                />
              );
            }),
          )}

          {map.nodes.map((n) => {
            const p = pos.get(n.id)!;
            const here = at === n.id;
            const can = openIds.has(n.id);
            return (
              <g key={n.id}>
                <circle
                  cx={p.x} cy={p.y} r={here ? R + 3 : R}
                  fill={here ? '#B45309' : can ? '#FFFBEB' : '#FDE68A'}
                  stroke={can || here ? '#92400E' : '#D4A24C'}
                  strokeWidth={can ? 3 : 1.5}
                />
                <text
                  x={p.x} y={p.y - R - 8}
                  textAnchor="middle" fontSize="12"
                  fill={can || here ? '#78350F' : '#B45309'}
                >
                  {LABEL[n.kind]}
                </text>
                {n.title && (
                  <text
                    x={p.x} y={p.y + R + 16}
                    textAnchor="middle" fontSize="10.5" fill="#92400E"
                  >
                    {clipLabel(n.title, g.labelWidth)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* 갈 수 있는 곳은 버튼으로도 낸다 — SVG 안의 작은 원을 손가락으로 정확히 누르게
          하면 좁은 화면에서 못 쓴다. 44px 이상을 지킨다. */}
      <div className="flex flex-wrap gap-2">
        {open.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onGo(n.id)}
            className="min-h-[44px] flex-1 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-left text-sm font-bold hover:bg-amber-100"
          >
            {LABEL[n.kind]}
            {n.title && (
              <span className="ml-2 font-normal text-[11px] text-amber-700">{n.title}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
