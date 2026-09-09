'use client';

// 막의 지도 (#430) — 목업 `Map.dc.html` 의 그래프.
//
// 노드를 SVG 로 그리고 **갈 수 있는 것만** 누를 수 있게 한다. 규칙(`run.enterNode`)도
// 스스로 막지만, 화면이 먼저 보여 주지 않으면 사람은 어디로 갈 수 있는지 모른다.
//
// ── 좌표를 왜 여기서 만드나 ──────────────────────────────────────────
//
// `map.ts` 는 층·칸만 준다(순수 로직이 화면 크기를 알 이유가 없다). 픽셀로 옮기는 일은
// 화면 몫이다. viewBox 를 고정하고 SVG 가 알아서 줄이므로 폭이 좁아도 안 잘린다 —
// 손패(#427)에서 폭을 역산해야 했던 것과 달리 여기서는 그럴 필요가 없다.

import type { ActMap } from '@/lib/eternia-refine/map';
import type { MapNode, NodeKind } from '@/lib/eternia-refine/types';

const VIEW_W = 880;
const VIEW_H = 360;
const PAD_X = 60;
const PAD_Y = 40;

/** 노드 종류를 사람 말로 — 화면이 id 를 그대로 쓰지 않게. */
const LABEL: Record<NodeKind, string> = {
  start: '출발',
  battle: '전투',
  elite: '정예',
  refinery: '정제소',
  event: '사건',
  alliance: '동맹',
  boss: '보스',
};

/** 층·칸 → 픽셀. 층이 가로, 칸이 세로다(목업과 같은 방향). */
function place(node: MapNode, rows: number, widths: number[]) {
  const x = PAD_X + (node.row / (rows - 1)) * (VIEW_W - PAD_X * 2);
  const n = widths[node.row];
  const y = n === 1 ? VIEW_H / 2 : PAD_Y + (node.col / (n - 1)) * (VIEW_H - PAD_Y * 2);
  return { x, y };
}

export interface MapScreenProps {
  map: ActMap;
  /** 지금 서 있는 노드. 막에 막 들어왔으면 null. */
  at: string | null;
  /** 지금 갈 수 있는 노드들. */
  open: MapNode[];
  onGo: (id: string) => void;
}

export function MapScreen({ map, at, open, onGo }: MapScreenProps) {
  const rows = Math.max(...map.nodes.map((n) => n.row)) + 1;
  const widths = Array.from({ length: rows }, (_, r) => map.nodes.filter((n) => n.row === r).length);
  const pos = new Map(map.nodes.map((n) => [n.id, place(n, rows, widths)]));
  const openIds = new Set(open.map((n) => n.id));

  return (
    <div className="flex flex-1 flex-col gap-3">
      <p className="text-sm text-amber-800">
        {at === null ? '어디로 들어갈지 고른다.' : '다음 길을 고른다.'}
      </p>

      <div className="relative flex-1 overflow-x-auto rounded-md border border-amber-300 bg-amber-100/60 p-3">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-full w-full min-w-[520px]" role="img" aria-label="지도">
          {/* 길 먼저 — 노드가 그 위에 얹혀야 가려지지 않는다. */}
          {map.nodes.flatMap((n) =>
            n.next.map((id) => {
              const a = pos.get(n.id)!;
              const b = pos.get(id)!;
              const live = at === n.id || (at === null && n.row === 0);
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
                  cx={p.x} cy={p.y} r={here ? 17 : 14}
                  fill={here ? '#B45309' : can ? '#FFFBEB' : '#FDE68A'}
                  stroke={can || here ? '#92400E' : '#D4A24C'}
                  strokeWidth={can ? 3 : 1.5}
                />
                <text
                  x={p.x} y={p.y + 34}
                  textAnchor="middle"
                  fontSize="13"
                  fill={can || here ? '#78350F' : '#B45309'}
                >
                  {LABEL[n.kind]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* 갈 수 있는 곳은 **버튼으로도** 낸다 — SVG 안의 작은 원을 손가락으로 정확히
          누르게 하면 좁은 화면에서 못 쓴다. 44px 이상을 지킨다. */}
      <div className="flex flex-wrap gap-2">
        {open.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onGo(n.id)}
            className="min-h-[44px] flex-1 rounded-md border border-amber-300 bg-amber-50 px-4 text-sm font-bold hover:bg-amber-100"
          >
            {LABEL[n.kind]}
            <span className="ml-2 font-mono text-[11px] text-amber-700">{n.id}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
