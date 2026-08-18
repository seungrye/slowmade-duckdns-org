"use client";

// 매매기록 내보내기 버튼 (#181).
//
// CSV 는 링크 하나면 된다 — 브라우저가 `Content-Disposition` 을 보고 알아서 내려받는다.
// `download` 속성은 일부러 **빼 뒀다**: 그걸 붙이면 브라우저가 파일명을 URL 에서 짐작하는데,
// 우리는 서버가 한글 이름(`매매기록-주문로그-20260818.csv`)을 헤더로 실어 보내기 때문이다.
//
// 구글 시트는 만드는 데 시간이 걸리므로(탭 넷 = API 왕복 다섯) 진행 상태를 보여 주고,
// 실패하면 **서버가 준 문구를 그대로** 띄운다 — "다시 로그인해 동의해 주세요" 같은 안내가
// 사용자에게 닿아야 한다.

import { useState } from "react";
import { DATASETS } from "@/lib/trading/export-datasets";

type State = { kind: "idle" } | { kind: "working" } | { kind: "error"; message: string };

export default function ExportButtons() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function exportToSheets() {
    setState({ kind: "working" });
    try {
      const res = await fetch("/api/my/trading/export/sheets", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: "error", message: body.message ?? `실패했습니다 (${res.status})` });
        return;
      }
      setState({ kind: "idle" });
      // 팝업 차단에 걸리면 아무 일도 안 일어난 것처럼 보인다 — 그때는 주소를 보여 준다.
      const win = window.open(body.url, "_blank", "noopener,noreferrer");
      if (!win) setState({ kind: "error", message: `시트를 만들었습니다: ${body.url}` });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

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
        <button
          type="button"
          onClick={exportToSheets}
          disabled={state.kind === "working"}
          className="text-xs px-3 py-1.5 rounded border border-green-600 text-green-700
                     dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30
                     disabled:opacity-50 disabled:cursor-wait transition-colors"
        >
          {state.kind === "working" ? "시트 만드는 중…" : "구글 시트로 내보내기"}
        </button>
      </div>

      {state.kind === "error" && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-2 break-all">{state.message}</p>
      )}

      <p className="text-xs text-gray-500 mt-2">
        CSV 는 엑셀에서 바로 열립니다. 구글 시트는 전체(탭 넷)를 한 문서로 만듭니다.
      </p>
    </section>
  );
}
