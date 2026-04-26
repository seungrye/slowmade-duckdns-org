'use client';

import { useEffect, useState } from 'react';
import { faChevronDown, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import dynamic from 'next/dynamic';
import { JSONContent } from '@tiptap/react';
import PostActions from './post-actions.section';
import { Badge } from '@/components/ui/badge';

const RichContentViewer = dynamic(
  () => import('@/components/rich-web-editor/viewer').then(m => m.RichContentViewer),
  {
    ssr: false,
    loading: () => <div className="h-40 animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />,
  }
);

interface RevisionItem {
  _id: string;
  version: number;
  title: string;
  author?: string;
  createdAt: string;
  isCurrent: boolean;
}

interface RevisionHistorySectionProps {
  postId: string;
  authorEmail: string;
  currentJsonContent: unknown;
  onBack: () => void;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export default function RevisionHistorySection({
  postId,
  authorEmail,
  currentJsonContent,
  onBack,
}: RevisionHistorySectionProps) {
  const [revisions, setRevisions] = useState<RevisionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [contents, setContents] = useState<Record<string, JSONContent>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/post/revisions?postId=${postId}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setRevisions(data);
      })
      .finally(() => setLoading(false));
  }, [postId]);

  const toggleRevision = async (revision: RevisionItem) => {
    if (openId === revision._id) {
      setOpenId(null);
      return;
    }

    setOpenId(revision._id);

    if (contents[revision._id]) return;

    setLoadingId(revision._id);
    try {
      let jsonContent: JSONContent;
      if (revision.isCurrent) {
        jsonContent = currentJsonContent as JSONContent;
      } else {
        const res = await fetch(`/api/post/revision?revisionId=${revision._id}`);
        const data = await res.json();
        jsonContent = data.jsonContent;
      }
      setContents(prev => ({ ...prev, [revision._id]: jsonContent }));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="mx-auto px-4 py-6">
      {/* 헤더 바 */}
      <div className="border border-gray-300 dark:border-gray-700 rounded-lg mb-4">
        <div className="w-full p-3 flex justify-between items-center gap-4">
          <span className="font-bold md:text-lg text-gray-800 dark:text-gray-200">변경 이력</span>
          <div className="flex-shrink-0">
            <PostActions postId={postId} authorEmail={authorEmail} onBack={onBack} />
          </div>
        </div>
      </div>

      {/* 리비전 목록 */}
      <div className="border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
            ))}
          </div>
        ) : revisions.length === 0 ? (
          <p className="p-6 text-center text-gray-400 dark:text-gray-500 text-sm">변경 이력이 없습니다.</p>
        ) : (
          revisions.map((revision, index) => {
            const isOpen = openId === revision._id;
            const isLast = index === revisions.length - 1;

            return (
              <div key={revision._id} className={!isLast ? 'border-b border-gray-200 dark:border-gray-700' : ''}>
                {/* 리비전 행 */}
                <button
                  onClick={() => toggleRevision(revision)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <span className="text-xs font-mono font-semibold text-gray-500 dark:text-gray-400 w-6 shrink-0">
                    v{revision.version}
                  </span>
                  {revision.isCurrent && (
                    <Badge variant="primary" className="text-xs shrink-0">현재</Badge>
                  )}
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                    {formatDate(revision.createdAt)}
                  </span>
                  <span className="flex-1 truncate text-sm text-gray-800 dark:text-gray-200">
                    {revision.title}
                  </span>
                  <FontAwesomeIcon
                    icon={isOpen ? faChevronDown : faChevronRight}
                    className="w-3 h-3 text-gray-400 dark:text-gray-500 shrink-0"
                  />
                </button>

                {/* 본문 (펼침) */}
                {isOpen && (
                  <div className="border-t border-gray-200 dark:border-gray-700 rich-web-editor-wrapper">
                    <div className="p-4">
                      {loadingId === revision._id ? (
                        <div className="h-40 animate-pulse bg-gray-100 dark:bg-gray-800 rounded" />
                      ) : contents[revision._id] ? (
                        <RichContentViewer content={contents[revision._id]} />
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
