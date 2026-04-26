'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { filterTags, getTagSize, TagInfo } from './tag-cloud-search.helpers';

export default function TagCloudSearch({ initialTags }: { initialTags: TagInfo[] }) {
  const [query, setQuery] = useState('');

  const filteredTags = useMemo(() => filterTags(initialTags, query), [query, initialTags]);

  const counts = filteredTags.map((item) => item.count);
  const minCount = Math.min(...counts, 0);
  const maxCount = Math.max(...counts, 0);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="검색할 태그를 입력하세요"
              className="w-full min-w-0 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {filteredTags.length > 0 ? (
          filteredTags.map((item) => (
            <Link
              key={item.tag}
              href={`/tags/${encodeURIComponent(item.tag)}`}
              className="inline-flex items-center px-3 text-gray-800 transition-colors duration-200 hover:text-blue-700 break-all"
              style={{ fontSize: `${getTagSize(item.count, minCount, maxCount)}rem` }}
            >
              <span className="font-medium">#{item.tag}</span>
              <span className="ml-2 text-xs text-gray-500">{item.count}</span>
            </Link>
          ))
        ) : (
          <div className="w-full rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-500">
            조건에 맞는 태그가 없습니다. 검색어를 변경해 보세요.
          </div>
        )}
      </div>
    </div>
  );
}
