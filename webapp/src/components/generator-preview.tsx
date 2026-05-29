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

const TILE_PX = 3; // 80×50 → 240×150 — 카드 8장 그리드에 적당.

function PreviewCanvas({ sample, width, height }: { sample: Sample; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = width * TILE_PX;
    canvas.height = height * TILE_PX;
    for (let y = 0; y < height; y++) {
      const row = sample.grid[y] ?? "";
      for (let x = 0; x < width; x++) {
        const ch = row[x] ?? "#";
        ctx.fillStyle = TILE_COLORS[ch] ?? "#000";
        ctx.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
      }
    }
  }, [sample, width, height]);

  return (
    <canvas
      ref={ref}
      className="border border-gray-300 dark:border-gray-700 rounded"
      style={{ imageRendering: "pixelated" }}
      title={`seed ${sample.seed}`}
    />
  );
}

export function GeneratorPreview({ generator }: { generator: string }) {
  const [data, setData] = useState<SampleFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    setLoading(true);
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

  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">
        {generator} 미리보기 ({data.samples.length} 시드 × {data.width}×{data.height})
      </div>
      <div className="grid grid-cols-4 gap-2">
        {data.samples.map((s) => (
          <div key={s.seed} className="text-center">
            <PreviewCanvas sample={s} width={data.width} height={data.height} />
            <div className="text-[10px] text-gray-400 font-mono">seed {s.seed}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
