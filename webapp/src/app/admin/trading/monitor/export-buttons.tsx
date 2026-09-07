// The trade-record export buttons (#181).
//
// CSV needs only a link - the browser sees `Content-Disposition` and downloads it itself.
// The `download` attribute is **deliberately left off**: with it, the browser guesses the filename from the URL,
// while our server sends a Korean name (`매매기록-주문로그-20260818.csv`) in the header.
//
// The Google Sheets export was **removed** (#228). It needed a GCP billing account and was blocked, so the direction was dropped.
// With that gone, the status and error displays became unnecessary and there was no longer any reason for a client component.

import { DATASETS } from "@/lib/trading/export-datasets";

export default function ExportButtons() {
  return (
    <section className="mb-4">
      <h2 className="text-lg font-semibold mb-2">내보내기</h2>
      <div className="flex flex-wrap gap-2">
        {DATASETS.map((d) => (
          <a
            key={d.id}
            href={`/api/my/trading/export?dataset=${d.id}`}
            className="text-xs px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600
                       hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {d.label} CSV
          </a>
        ))}
      </div>

      <p className="text-xs text-gray-500 mt-2">CSV 는 엑셀에서 바로 열립니다.</p>
    </section>
  );
}
