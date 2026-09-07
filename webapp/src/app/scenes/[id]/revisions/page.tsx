// The old quest CMS pattern - a page dedicated to scene revisions.
//
// /scenes/[id]/revisions
//   - the header: 'Revisions - <id>' plus a '<- back to scene editing' link.
//   - the body: <RevisionHistorySection sceneId={id} onRestore={...} defaultOpen={true} />.
//   - the restore callback - a plain reload (the page being revisions-only, the new state shows at once).
//   - the diff compares *v_{N-1} -> v_N* (each commit's change).

"use client";

import { use } from "react";
import Link from "next/link";
import { RevisionHistorySection } from "../../graph/revisionHistorySection";

interface Props {
  params: Promise<{ id: string }>;
}

export default function SceneRevisionsPage({ params }: Props) {
  const { id } = use(params);

  // After restoring - a page reload (kept simple).
  function handleRestore() {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }

  return (
    <div className="mx-auto px-4 py-6 max-w-4xl space-y-4">
      <div className="space-y-1">
        <Link
          href={`/scenes/${encodeURIComponent(id)}`}
          className="text-xs text-blue-500 hover:underline"
        >
          ← 씬 편집으로
        </Link>
        <h1 className="text-2xl font-bold mt-1">
          리비전 — <span className="font-mono">{id}</span>
        </h1>
        <p className="text-xs text-gray-500">
          이 씬의 모든 변경 이력. 각 항목은 *직전 리비전 → 그 리비전* 의 변경
          사항을 보여줍니다. v0 은 최초 작성 (이전 없음).
        </p>
      </div>

      <RevisionHistorySection
        sceneId={id}
        onRestore={handleRestore}
        defaultOpen={true}
      />
    </div>
  );
}
