// RevisionHistorySection - the collapsible change-history section inside the SidePanel.
//
// Reclaiming the old post/view revision-history.section.tsx pattern:
//   - collapsed by default (useState(false)) - the fetch is deferred too.
//   - expanding -> GET /api/web-adventure/scenes/[id]/revisions -> the list.
//   - clicking an item -> a single GET (including the snapshot) -> an inline preview.
//   - "revert to this point" -> confirm -> POST /restore -> the onRestore callback.
//   - the faChevronRight / faChevronDown icons.

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
  /** The old quest CMS pattern - expanded by default when mounted on its own page. */
  defaultOpen?: boolean;
}

// The unified diff format - the same hunk plus context pattern as git diff.
//   - hunk-header (@@ -A,B +C,D @@)
//   - added (+) / removed (-) / same (a space, context)
// jsdiff's structuredPatch gives each hunk's lines as *an array of strings already prefixed
// with +/-/space* -> used as they are.
interface DiffRow {
  kind: "added" | "removed" | "same" | "hunk-header";
  text: string;
}

function buildDiffRows(currentJson: string, snapshotJson: string): DiffRow[] {
  // snapshot = old, current = new.
  // context=3 lines (git's default). With no change, hunks is an empty array -> no rows.
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
      // The first character is the +/-/space prefix. A line such as \ No newline at end of file counts as same.
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
  // openSeq - +1 on every expand toggle. Even for the same sceneId, *expanding again* refetches (so a save or restore shows fresh).
  // With defaultOpen=true it starts at 1 to guarantee one fetch right after mounting.
  const [openSeq, setOpenSeq] = useState(defaultOpen ? 1 : 0);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<RevisionListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The expanded single revision (including the snapshot). version -> detail.
  const [details, setDetails] = useState<Record<number, RevisionDetail>>({});
  const [activeVersion, setActiveVersion] = useState<number | null>(null);
  const [loadingVersion, setLoadingVersion] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);

  // The list is fetched when expanded. Every openSeq change (= every expand toggle) fetches fresh - reflecting a save or restore.
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

  // The cache is reset when sceneId changes (moving to another scene's panel).
  // With defaultOpen=true the expanded state is kept *at mount*, so there is no reset branch
  // (safe in practice, since sceneId never changes on the separate page).
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
      // Both this revision and the one before it (version-1) are fetched (for the diff comparison).
      // v0 has nothing before it -> shown as "first write".
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
    // The git-like meaning: v{N} = the Nth PUT commit. The snapshot is the state after that commit.
    // 'revert to v{N}' = overwriting mongo with v{N}'s snapshot (undoing the changes after it).
    // The current state is backed up automatically as a *restore commit*, so it can be reverted again.
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
        // The cache is reset so the list refetches.
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
            // The expand toggle increments seq - re-running the fetch effect.
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
// #revision-diff - the change from *the previous snapshot (v_{N-1})* to *this snapshot (v_N)*.
// A unified diff (git's format). v0 is handled separately ("first write", never calling this).
function DiffPanel({
  prevSnapshot,
  snapshot,
}: {
  prevSnapshot: RevisionDetail["snapshot"];
  snapshot: RevisionDetail["snapshot"];
}) {
  const prevJson = stringifyForDiff(prevSnapshot);
  const snapshotJson = stringifyForDiff(snapshot);
  // In buildDiffRows(current, snapshot), *snapshot is old and current is new*.
  // We align the meaning as *prev is old and snapshot is new*.
  // buildDiffRows' arguments: (currentJson, snapshotJson) - internally snapshot=old, current=new.
  // So the call is (newJson, oldJson) = (snapshotJson, prevJson).
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

// Serialisation - indented JSON after stripping the visual noise (_id / __v / timestamps).
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
