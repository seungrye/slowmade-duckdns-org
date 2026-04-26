"use client";

import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { diffWords, Change } from 'diff';
import { RevisionListItem } from '@/lib/revisions';
import { htmlToText, isFromRadioDisabled, isToRadioDisabled } from '@/lib/revision-utils';

interface Props {
    postId: string;
    onRestore: (jsonContent: unknown, title: string, urls: unknown[], revisionId: string) => void;
    loadedRevisionId: string | null;
}

interface DiffResult {
    fromRevision: RevisionListItem;
    toRevision: RevisionListItem;
    oldTitle: string;
    newTitle: string;
    parts: Change[];
}

function formatDate(date: Date | string) {
    return new Date(date).toLocaleString('ko-KR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
    });
}

async function fetchContent(revisionId: string, postId: string, isCurrentVersion: boolean) {
    if (isCurrentVersion) {
        const res = await fetch(`/api/post?_id=${postId}`);
        if (!res.ok) throw new Error();
        return res.json();
    }
    const res = await fetch(`/api/post/revision?revisionId=${revisionId}`);
    if (!res.ok) throw new Error();
    return res.json();
}

export default function RevisionHistorySection({ postId, onRestore, loadedRevisionId }: Props) {
    const [revisions, setRevisions] = useState<RevisionListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [fromId, setFromId] = useState<string | null>(null);
    const [toId, setToId] = useState<string | null>(null);
    const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
    const [comparing, setComparing] = useState(false);
    const [restoring, setRestoring] = useState(false);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/post/revisions?postId=${postId}`);
                if (!res.ok) return;
                const data: RevisionListItem[] = await res.json();
                setRevisions(data);
                if (data.length >= 2) {
                    setToId(data[0]._id);
                    setFromId(data[1]._id);
                }
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [postId]);

    const fromVersion = revisions.find(r => r._id === fromId)?.version ?? -Infinity;
    const toVersion = revisions.find(r => r._id === toId)?.version ?? Infinity;
    const canCompare = Boolean(fromId && toId && fromId !== toId && fromVersion < toVersion);

    const handleCompare = async () => {
        if (!fromId || !toId) return;
        const fromRevision = revisions.find(r => r._id === fromId)!;
        const toRevision = revisions.find(r => r._id === toId)!;

        setComparing(true);
        try {
            const [fromData, toData] = await Promise.all([
                fetchContent(fromId, postId, fromId === revisions[0]?._id),
                fetchContent(toId, postId, toId === revisions[0]?._id),
            ]);
            setDiffResult({
                fromRevision,
                toRevision,
                oldTitle: fromData.title,
                newTitle: toData.title,
                parts: diffWords(
                    htmlToText(fromData.htmlContent || ''),
                    htmlToText(toData.htmlContent || ''),
                ),
            });
        } catch {
            toast.error('비교를 불러오는 데 실패했습니다.');
        } finally {
            setComparing(false);
        }
    };

    const handleRestore = async (revision: RevisionListItem) => {
        if (!confirm(`v${revision.version} 버전을 에디터에 불러오시겠습니까?`)) return;
        setRestoring(true);
        try {
            const isCurrent = revision._id === revisions[0]?._id;
            const data = await fetchContent(revision._id, postId, isCurrent);
            onRestore(data.jsonContent, data.title, data.urls || [], revision._id);
        } catch {
            toast.error('버전을 불러오는 데 실패했습니다.');
        } finally {
            setRestoring(false);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                수정 이력 불러오는 중...
            </div>
        );
    }

    if (revisions.length <= 1) {
        return (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                수정 이력이 없습니다.
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col min-h-0 border border-gray-200 rounded-lg overflow-hidden">
            {/* Revision list */}
            <div className="overflow-auto">
                <table className="w-full min-w-[480px] text-sm border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-3 py-2 text-xs font-medium text-gray-500 text-center w-12">이전</th>
                            <th className="px-3 py-2 text-xs font-medium text-gray-500 text-center w-12">이후</th>
                            <th className="px-3 py-2 text-xs font-medium text-gray-500 text-left w-20">버전</th>
                            <th className="px-3 py-2 text-xs font-medium text-gray-500 text-left w-40">날짜</th>
                            <th className="px-3 py-2 text-xs font-medium text-gray-500 text-left">제목</th>
                        </tr>
                    </thead>
                    <tbody>
                        {revisions.map((revision, index) => {
                            const isDbCurrent = index === 0;
                            const isLoaded = revision._id === loadedRevisionId;
                            const isFromSelected = fromId === revision._id;
                            const isToSelected = toId === revision._id;
                            const fromDisabled = isFromRadioDisabled(revision.version, toId !== null ? toVersion : null);
                            const toDisabled = isToRadioDisabled(revision.version, fromId !== null ? fromVersion : null);

                            return (
                                <tr
                                    key={revision._id}
                                    className={`border-b border-gray-100 last:border-0 ${
                                        isFromSelected || isToSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <td className="px-3 py-2 text-center">
                                        <input
                                            type="radio"
                                            name="from"
                                            checked={isFromSelected}
                                            disabled={fromDisabled}
                                            onChange={() => { setFromId(revision._id); setDiffResult(null); }}
                                            className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                                        />
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        <input
                                            type="radio"
                                            name="to"
                                            checked={isToSelected}
                                            disabled={toDisabled}
                                            onChange={() => { setToId(revision._id); setDiffResult(null); }}
                                            className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                                        />
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                                                v{revision.version}
                                            </span>
                                            {isDbCurrent && (
                                                <span className="text-xs text-blue-600 bg-blue-100 px-1 py-0.5 rounded">저장됨</span>
                                            )}
                                            {isLoaded && (
                                                <span className="text-xs text-amber-700 bg-amber-100 px-1 py-0.5 rounded">편집 중</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                                        {formatDate(revision.createdAt)}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-gray-700">{revision.title}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleRestore(revision)}
                                                disabled={restoring || isLoaded}
                                                className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                복원
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Compare action bar */}
            <div className="border-t border-gray-200 px-4 py-2 flex items-center justify-between bg-gray-50 shrink-0">
                <span className="text-xs text-gray-400">
                    이전·이후 버전을 각각 선택 후 비교
                </span>
                <button
                    type="button"
                    onClick={handleCompare}
                    disabled={!canCompare || comparing}
                    className="text-sm px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    {comparing ? '비교 중...' : '비교'}
                </button>
            </div>

            {/* Diff view */}
            {diffResult && (
                <div className="border-t border-gray-300 flex flex-col flex-1 min-h-0">
                    <div className="px-4 py-2 bg-gray-100 border-b border-gray-200 flex items-center justify-between shrink-0">
                        <span className="text-xs text-gray-600 font-medium">
                            v{diffResult.fromRevision.version} ({formatDate(diffResult.fromRevision.createdAt)})
                            {' → '}
                            v{diffResult.toRevision.version} ({formatDate(diffResult.toRevision.createdAt)})
                        </span>
                        <span className="flex items-center gap-3 text-xs">
                            <span className="flex items-center gap-1 text-red-600">
                                <span className="inline-block w-3 h-3 bg-red-200 rounded" />삭제
                            </span>
                            <span className="flex items-center gap-1 text-green-700">
                                <span className="inline-block w-3 h-3 bg-green-200 rounded" />추가
                            </span>
                        </span>
                    </div>
                    <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3">
                        {diffResult.oldTitle !== diffResult.newTitle && (
                            <div className="text-sm">
                                <span className="text-xs font-medium text-gray-400 block mb-1">제목 변경</span>
                                <del className="text-red-700 bg-red-100 px-1 rounded not-italic mr-1">
                                    {diffResult.oldTitle}
                                </del>
                                →
                                <span className="text-green-800 bg-green-100 px-1 rounded ml-1">
                                    {diffResult.newTitle}
                                </span>
                            </div>
                        )}
                        <div className="text-sm">
                            <span className="text-xs font-medium text-gray-400 block mb-1">본문</span>
                            <p className="whitespace-pre-wrap leading-relaxed text-gray-800">
                                {diffResult.parts.map((part, i) => {
                                    if (part.added) {
                                        return (
                                            <mark key={i} className="bg-green-100 text-green-800 rounded not-italic">
                                                {part.value}
                                            </mark>
                                        );
                                    }
                                    if (part.removed) {
                                        return (
                                            <del key={i} className="bg-red-100 text-red-700 rounded">
                                                {part.value}
                                            </del>
                                        );
                                    }
                                    return <span key={i}>{part.value}</span>;
                                })}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
