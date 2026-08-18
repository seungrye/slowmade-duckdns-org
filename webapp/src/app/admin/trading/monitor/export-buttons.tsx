"use client";

// 매매기록 내보내기 버튼 (#181).
//
// 링크 하나면 되는 일이라 상태도 fetch 도 두지 않는다 — 브라우저가 `Content-Disposition`
// 을 보고 알아서 내려받는다. `download` 속성은 일부러 **빼 뒀다**: 그걸 붙이면 브라우저가
// 파일명을 URL 에서 짐작하는데, 우리는 서버가 한글 이름(`매매기록-주문로그-20260818.csv`)을
// 헤더로 실어 보내기 때문이다.

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
      <p className="text-xs text-gray-500 mt-2">
        엑셀에서 바로 열립니다. 구글 스프레드시트는 <b>파일 &gt; 가져오기</b> 로 올리면 됩니다.
      </p>
    </section>
  );
}
