// RevisionHistorySection — SidePanel 안 collapsible 변경 이력 섹션.
//
// 옛 post/view 의 revision-history.section.tsx 패턴 회수:
//   - 기본 접힘 (useState(false)) — fetch 도 지연.
//   - 펼치면 GET /api/web-adventure/scenes/[id]/revisions → 목록.
//   - 항목 클릭 → GET 단일 (snapshot 포함) → 인라인 미리보기.
//   - "이 시점 으로 되돌리기" → confirm → POST /restore → onRestore 콜백.
//   - faChevronRight / faChevronDown 아이콘.

"use client";

import { useEffect, useState } from "react";
import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { structuredPatch } from "diff";

interface RevisionListItem {
  _id: string;
  version: number;
  author?: string;
  createdAt: string;
}

interface RevisionDetail {
  _id: string;
  sceneId: string;
  version: number;
  author?: string;
  createdAt: string;
  snapshot: {
    id?: string;
    title?: string;
    body?: string[];
    [k: string]: unknown;
  };
}

interface Props {
  sceneId: string;
  onRestore: () => void;
  /** 옛 quest CMS 패턴 — 별도 페이지에 마운트 될 때는 기본 펼침. */
  defaultOpen?: boolean;
}

// unified diff 형식 — git diff 와 동일한 hunk + 컨텍스트 패턴.
//   - hunk-header (@@ -A,B +C,D @@)
//   - added (+) / removed (-) / same (공백, 컨텍스트)
// jsdiff 의 structuredPatch 가 각 hunk 의 lines 를 *이미 +/-/공백 prefix 한
// 문자열 배열* 로 제공 → 그대로 사용.
interface DiffRow {
  kind: "added" | "removed" | "same" | "hunk-header";
  text: string;
}

function buildDiffRows(currentJson: string, snapshotJson: string): DiffRow[] {
  // snapshot = 옛 (old), current = 새 (new).
  // context=3 lines (git 기본). 변경 없으면 hunks 빈 배열 → row 없음.
  const patch = structuredPatch(
    "old",
    "new",
    snapshotJson,
    currentJson,
    "",
    "",
    { context: 3 },
  );
  const rows: DiffRow[] = [];
  for (const hunk of patch.hunks) {
    rows.push({
      kind: "hunk-header",
      text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    });
    for (const line of hunk.lines) {
      // 첫 문자가 +/-/공백 prefix. \ No newline at end of file 같은 라인은 same 으로.
      const ch = line.charAt(0);
      const text = line.slice(1);
      if (ch === "+") rows.push({ kind: "added", text });
      else if (ch === "-") rows.push({ kind: "removed", text });
      else rows.push({ kind: "same", text });
    }
  }
  return rows;
}

function formatKoreanDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function RevisionHistorySection({
  sceneId,
  onRestore,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  // openSeq — 펼침 토글마다 +1. 같은 sceneId 라도 *다시 펼침* 시 재 fetch (저장/복원 직후 신선 반영).
  // defaultOpen=true 일 때는 마운트 직후 1 회 fetch 보장 위해 1 부터 시작.
  const [openSeq, setOpenSeq] = useState(defaultOpen ? 1 : 0);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<RevisionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 펼친 단일 revision (snapshot 포함). version → detail.
  const [details, setDetails] = useState<Record<number, RevisionDetail>>({});
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [loadingVersion, setLoadingVersion] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);

  // 펼쳤을 때 목록 fetch. openSeq 변경마다 (= 매 펼침 토글) 신선 fetch — 저장/복원 직후 반영.
  useEffect(() => {
    if (!open || openSeq === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/web-adventure/scenes/${encodeURIComponent(sceneId)}/revisions`,
        );
        const json = (await res.json().catch(() => ({}))) as {
          data?: RevisionListItem[];
          message?: string;
        };
        if (!cancelled) {
          if (!res.ok) {
            setError(json.message ?? "리비전 목록 조회 실패");
          } else {
            setList(json.data ?? []);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "오류");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, openSeq, sceneId]);

  // sceneId 변경 시 캐시 초기화 (다른 씬 패널로 이동).
  // defaultOpen=true 일 때는 *마운트 시* 펼침 상태 유지하므로 초기화 분기 X
  // (실제로 별도 페이지에서는 sceneId 변경이 발생하지 않으므로 안전).
  useEffect(() => {
    setList(null);
    setDetails({});
    setActiveVersion(null);
    setOpen(defaultOpen);
    setOpenSeq(defaultOpen ? 1 : 0);
    setError(null);
  }, [sceneId, defaultOpen]);

  async function toggleRevision(version: number) {
    if (activeVersion === version) {
      setActiveVersion(null);
      return;
    }
    setActiveVersion(version);
    setLoadingVersion(version);
    try {
      // 이 revision + 직전 revision (version-1) 둘 다 fetch (diff 비교용).
      // v0 은 직전 없음 → "최초 작성" 표시.
      const fetches: Array<Promise<RevisionDetail | null>> = [];
      if (!details[version]) {
        fetches.push(
          fetch(`/api/web-adventure/scenes/${encodeURIComponent(sceneId)}/revisions/${version}`)
            .then((r) => r.json().catch(() => ({})))
            .then((j: { data?: RevisionDetail }) => j.data ?? null),
        );
      } else {
        fetches.push(Promise.resolve(null));
      }
      if (version >= 1 && !details[version - 1]) {
        fetches.push(
          fetch(`/api/web-adventure/scenes/${encodeURIComponent(sceneId)}/revisions/${version - 1}`)
            .then((r) => r.json().catch(() => ({})))
            .then((j: { data?: RevisionDetail }) => j.data ?? null),
        );
      } else {
        fetches.push(Promise.resolve(null));
      }
      const [cur, prev] = await Promise.all(fetches);
      setDetails((d) => {
        const next = { ...d };
        if (cur) next[version] = cur;
        if (prev) next[version - 1] = prev;
        return next;
      });
    } finally {
      setLoadingVersion(null);
    }
  }

  async function handleRestore(version: number) {
    // git-like 의미: v{N} = N 번째 PUT commit. snapshot = 그 commit 후 상태.
    // 'v{N} 으로 되돌리기' = mongo 를 v{N} 의 snapshot 으로 덮어쓰기 (이후 변경 취소).
    // 현재 상태는 *복원 commit* 으로 자동 백업되어 다시 되돌릴 수 있다.
    const ok = window.confirm(
      `v${version} 의 내용으로 되돌립니다.\nv${version} 이후의 모든 변경이 취소됩니다.\n현재 상태는 새 리비전으로 자동 백업되어 다시 되돌릴 수 있습니다.\n\n계속하시겠습니까?`,
    );
    if (!ok) return;
    setRestoring(true);
    try {
      const res = await fetch(
        `/api/web-adventure/scenes/${encodeURIComponent(sceneId)}/restore`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version }),
        },
      );
      if (res.ok) {
        // 목록 재 fetch 위해 캐시 초기화.
        setList(null);
        setDetails({});
        setActiveVersion(null);
        onRestore();
      } else {
        const json = (await res.json().catch(() => ({}))) as { message?: string };
        setError(json.message ?? "복원 실패");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "복원 실패");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <section className="border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-950/30 rounded p-2">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            // 펼침 토글 시 seq 증가 — fetch effect 재실행.
            if (next) setOpenSeq((s) => s + 1);
            return next;
          });
        }}
        className="w-full flex items-center justify-between gap-2 text-xs font-semibold text-amber-800 dark:text-amber-200 hover:text-amber-900 dark:hover:text-amber-100"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5">
          <FontAwesomeIcon
            icon={open ? faChevronDown : faChevronRight}
            className="w-3 h-3"
          />
          🕰 변경 이력 (revisions)
        </span>
        {list && (
          <span className="text-[10px] font-mono text-amber-700 dark:text-amber-300">
            {list.length}개
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-1">
          {loading && (
            <p className="text-[11px] text-gray-400">불러오는 중…</p>
          )}
          {error && <p className="text-[11px] text-red-500">{error}</p>}
          {list && list.length === 0 && (
            <p className="text-[11px] text-gray-400">아직 변경 이력이 없습니다.</p>
          )}
          {list && list.length > 0 && (
            <ul className="border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700">
              {list.map((item) => {
                const isOpen = activeVersion === item.version;
                const detail = details[item.version];
                return (
                  <li key={item._id} className="bg-white dark:bg-gray-900">
                    <button
                      type="button"
                      onClick={() => toggleRevision(item.version)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <FontAwesomeIcon
                        icon={isOpen ? faChevronDown : faChevronRight}
                        className="w-2.5 h-2.5 text-gray-400 shrink-0"
                      />
                      <span className="text-[10px] font-mono font-semibold text-gray-500 dark:text-gray-400 w-6 shrink-0">
                        v{item.version}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                        {formatKoreanDateTime(item.createdAt)}
                      </span>
                      <span className="flex-1 truncate text-[11px] text-gray-700 dark:text-gray-300">
                        {item.author ?? "system"}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/40 border-t border-gray-200 dark:border-gray-700 space-y-1.5">
                        {loadingVersion === item.version && (
                          <p className="text-[11px] text-gray-400">불러오는 중…</p>
                        )}
                        {detail && (
                          <>
                            {/* #revision-diff — v_{N-1} → v_N 의 변경 사항.
                                v0 은 직전 없음 → "최초 작성" 표시. */}
                            {item.version === 0 ? (
                              <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                                최초 작성 (이전 버전 없음)
                              </p>
                            ) : details[item.version - 1] ? (
                              <DiffPanel
                                prevSnapshot={details[item.version - 1].snapshot}
                                snapshot={detail.snapshot}
                              />
                            ) : (
                              <p className="text-[11px] text-gray-400">
                                직전 리비전 불러오는 중…
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRestore(item.version)}
                              disabled={restoring}
                              className="mt-1 px-2 py-0.5 text-[10px] rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                            >
                              {restoring ? "되돌리는 중…" : "이 내용으로 되돌리기"}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

// ── DiffPanel ─────────────────────────────────────────────────────────────
// #revision-diff — *직전 snapshot (v_{N-1})* → *이 snapshot (v_N)* 의 변경.
// unified diff (git 형식). v0 은 별도 처리 ("최초 작성", 호출 안 됨).
function DiffPanel({
  prevSnapshot,
  snapshot,
}: {
  prevSnapshot: RevisionDetail["snapshot"];
  snapshot: RevisionDetail["snapshot"];
}) {
  const prevJson = stringifyForDiff(prevSnapshot);
  const snapshotJson = stringifyForDiff(snapshot);
  // buildDiffRows(current, snapshot) 시 *snapshot 이 old, current 가 new*.
  // 우리는 *prev 가 old, snapshot 이 new* 로 의미 정렬.
  // buildDiffRows 의 인자: (currentJson, snapshotJson) — 내부에서 snapshot=old, current=new.
  // 따라서 호출 = (newJson, oldJson) = (snapshotJson, prevJson).
  const rows = buildDiffRows(snapshotJson, prevJson);

  return (
    <div
      data-testid="revision-diff"
      className="border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 max-h-96 overflow-y-auto"
    >
      <div className="font-mono text-[10px] whitespace-pre-wrap">
        {rows.length === 0 && (
          <span className="block px-2 py-1 text-gray-400">변경 없음</span>
        )}
        {rows.map((row, i) => {
          if (row.kind === "hunk-header") {
            return (
              <span
                key={i}
                data-testid="revision-diff-hunk-header"
                className="block px-2 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold"
              >
                {row.text}
              </span>
            );
          }
          const prefix = row.kind === "added" ? "+" : row.kind === "removed" ? "-" : " ";
          const cls =
            row.kind === "added"
              ? "block px-2 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
              : row.kind === "removed"
                ? "block px-2 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200"
                : "block px-2 text-gray-600 dark:text-gray-400";
          const testId =
            row.kind === "added"
              ? "revision-diff-line-added"
              : row.kind === "removed"
                ? "revision-diff-line-removed"
                : "revision-diff-line-same";
          return (
            <span key={i} data-testid={testId} className={cls}>
              {prefix}
              {row.text || " "}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// 직렬화 — 시각 노이즈 (_id / __v / timestamps) 제거 후 indented JSON.
function stringifyForDiff(scene: Record<string, unknown>): string {
  const omit = new Set([
    "_id",
    "__v",
    "createdAt",
    "updatedAt",
    "revisionCount",
  ]);
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(scene as Record<string, unknown>)) {
    if (omit.has(k)) continue;
    filtered[k] = v;
  }
  return JSON.stringify(filtered, null, 2);
}

export default RevisionHistorySection;
