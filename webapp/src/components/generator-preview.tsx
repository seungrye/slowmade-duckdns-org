"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Generator 카탈로그 미리보기 — bevy-rogue 의 `sample_generators` CLI 가
 * `public/generator-samples/<name>.json` 으로 prebuild 한 8 시드 샘플을 로드해
 * Canvas 로 작게 그린다.
 *
 * 데이터 포맷 (사용자가 cargo run --bin sample_generators 으로 갱신):
 * ```json
 * { "name": "forest", "width": 80, "height": 50,
 *   "samples": [{ "seed": 42, "grid": ["####...", ...] }, ...] }
 * ```
 *
 * 레이아웃:
 * - 데스크톱(sm 이상): 4-col grid 2 row 로 8 장 모두 표시 (작게).
 * - 모바일(< sm): 한 장 캐로셀 — 좌/우 화살표 + 도트 + swipe. canvas 는
 *   `max-w-full h-auto` 로 컨테이너 폭을 넘지 않게 스케일.
 *
 * Site 는 정적 자산만 서빙 — Rust 코드는 직접 실행 불가하므로 prebuild 패턴.
 * generator 추가/변경 시 bevy-rogue 측에서 다시 실행해 JSON 만 갱신하면 된다.
 */

interface Sample {
  seed: number;
  grid: string[];
}

interface SampleFile {
  name: string;
  width: number;
  height: number;
  samples: Sample[];
}

/** 타일 문자 → 색 매핑. 게임의 `tile_base_color` 와 시각적으로 일치하도록 선택. */
const TILE_COLORS: Record<string, string> = {
  "#": "#3a3a3a", // Wall — 짙은 회색
  ".": "#d4c8a0", // Floor — 베이지
  "~": "#4488cc", // Water — 파랑
  s: "#e8d8a0", // Sand
  d: "#8b7765", // DestructibleWall
  r: "#7d6850", // Rubble
  c: "#b8843e", // Counter — 나무
};

const TILE_PX_GRID = 3;     // 데스크톱 4-col grid 의 한 칸 — 80×50 → 240×150.
const TILE_PX_CAROUSEL = 4; // 모바일 캐로셀의 한 장 — 80×50 → 320×200 (CSS 로 max 100%).

/**
 * Canvas 로 grid 를 그린다. canvas 의 *intrinsic* 사이즈는 width×tilePx 이지만,
 * CSS `max-w-full h-auto` 로 컨테이너 폭을 넘으면 자동 스케일 다운된다.
 * `imageRendering: pixelated` 로 픽셀이 뭉개지지 않게.
 */
function PreviewCanvas({
  sample,
  width,
  height,
  tilePx,
}: {
  sample: Sample;
  width: number;
  height: number;
  tilePx: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = width * tilePx;
    canvas.height = height * tilePx;
    for (let y = 0; y < height; y++) {
      const row = sample.grid[y] ?? "";
      for (let x = 0; x < width; x++) {
        const ch = row[x] ?? "#";
        ctx.fillStyle = TILE_COLORS[ch] ?? "#000";
        ctx.fillRect(x * tilePx, y * tilePx, tilePx, tilePx);
      }
    }
  }, [sample, width, height, tilePx]);

  return (
    <canvas
      ref={ref}
      className="border border-gray-300 dark:border-gray-700 rounded max-w-full h-auto"
      style={{ imageRendering: "pixelated" }}
      title={`seed ${sample.seed}`}
    />
  );
}

export function GeneratorPreview({ generator }: { generator: string }) {
  const [data, setData] = useState<SampleFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  // 모바일 swipe 시작 X 좌표.
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setLoading(true);
    setIdx(0); // generator 가 바뀌면 캐로셀 처음으로
    fetch(`/generator-samples/${encodeURIComponent(generator)}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: SampleFile) => {
        if (cancelled) return;
        setData(json);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [generator]);

  if (loading) {
    return <div className="text-xs text-gray-400">미리보기 로딩 중…</div>;
  }
  if (error) {
    return (
      <div className="text-xs text-gray-400">
        샘플 없음 ({generator}.json) — bevy-rogue 의 sample_generators 를 다시 실행하세요.
      </div>
    );
  }
  if (!data) return null;

  const samples = data.samples;
  if (samples.length === 0) return null;
  const safeIdx = ((idx % samples.length) + samples.length) % samples.length;
  const current = samples[safeIdx];
  const prev = () => setIdx((i) => (i - 1 + samples.length) % samples.length);
  const next = () => setIdx((i) => (i + 1) % samples.length);

  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">
        {generator} 미리보기 (
        <span className="hidden sm:inline">{samples.length} 시드</span>
        <span className="sm:hidden">
          {safeIdx + 1}/{samples.length}
        </span>
        {" × "}
        {data.width}×{data.height})
      </div>

      {/* 데스크톱 — 4-col grid 2 row. 카드 내부 padding p-2, 카드 간 gap 없음. */}
      <div className="hidden sm:grid sm:grid-cols-4">
        {samples.map((s) => (
          <div key={s.seed} className="text-center p-2">
            <PreviewCanvas
              sample={s}
              width={data.width}
              height={data.height}
              tilePx={TILE_PX_GRID}
            />
            <div className="text-[10px] text-gray-400 font-mono">seed {s.seed}</div>
          </div>
        ))}
      </div>

      {/* 모바일 — 캐로셀 (한 장 + 좌/우 화살표 + 도트 + swipe).
          캐로셀 컨테이너는 padding 없이 이미지를 폭 가득 채우고, chevron 버튼이
          이미지 가장자리에 반쯤 걸쳐 overlay 된다. */}
      <div className="sm:hidden">
        <div
          className="relative flex items-center justify-center"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchStartX.current;
            touchStartX.current = null;
            if (start == null) return;
            const end = e.changedTouches[0]?.clientX ?? start;
            const dx = end - start;
            if (dx > 30) prev();
            else if (dx < -30) next();
          }}
        >
          <button
            type="button"
            onClick={prev}
            aria-label="이전 시드"
            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-white/75 dark:bg-gray-900/75 border border-gray-300 dark:border-gray-700 shadow hover:bg-white dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="text-center min-w-0 max-w-full">
            <PreviewCanvas
              sample={current}
              width={data.width}
              height={data.height}
              tilePx={TILE_PX_CAROUSEL}
            />
            <div className="text-[10px] text-gray-400 font-mono mt-1">seed {current.seed}</div>
          </div>
          <button
            type="button"
            onClick={next}
            aria-label="다음 시드"
            className="absolute right-1 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-white/75 dark:bg-gray-900/75 border border-gray-300 dark:border-gray-700 shadow hover:bg-white dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        {/* 인덱스 도트 */}
        <div className="flex justify-center gap-1.5 mt-2 flex-wrap">
          {samples.map((s, i) => (
            <button
              key={s.seed}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`시드 ${s.seed}`}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === safeIdx ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600 hover:bg-gray-400"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
