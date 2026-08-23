// 매매기록 내보내기 버튼 (#181).
//
// CSV 는 링크 하나면 된다 — 브라우저가 `Content-Disposition` 을 보고 알아서 내려받는다.
// `download` 속성은 일부러 **빼 뒀다**: 그걸 붙이면 브라우저가 파일명을 URL 에서 짐작하는데,
// 우리는 서버가 한글 이름(`매매기록-주문로그-20260818.csv`)을 헤더로 실어 보내기 때문이다.
//
// 구글 시트 내보내기는 **제거됐다** (#228). GCP 결제 계좌가 필요해 막혀 있었고 방향을 접었다.
// 그게 빠지면서 상태·에러 표시가 전부 필요 없어져 클라이언트 컴포넌트일 이유도 사라졌다.

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
