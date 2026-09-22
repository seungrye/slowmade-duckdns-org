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
              className="w-full min-w-0 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {filteredTags.length > 0 ? (
          filteredTags.map((item) => (
            // prefetch={false} — 이 화면은 태그를 **전부** 한 번에 그린다(457개). Next 의
            // 자동 prefetch 를 그대로 두면 페이지를 여는 것만으로 `?_rsc=` 요청이 400건 넘게
            // 쏟아진다 (#481, 실측 초당 190건). 정작 사용자가 누르는 건 하나다 —
            // 나머지의 RSC 페이로드는 서버가 만들어 보내고 브라우저가 버린다.
            // 태그 목록은 단일 조회라 클릭 후 받아도 체감 지연이 거의 없다.
            <Link
              key={item.tag}
              href={`/tags/${encodeURIComponent(item.tag)}`}
              prefetch={false}
              className="inline-flex items-center px-3 text-gray-800 dark:text-gray-200 transition-colors duration-200 hover:text-blue-700 dark:hover:text-blue-400 break-all"
              style={{ fontSize: `${getTagSize(item.count, minCount, maxCount)}rem` }}
            >
              <span className="font-medium">#{item.tag}</span>
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{item.count}</span>
            </Link>
          ))
        ) : (
          <div className="w-full rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
            조건에 맞는 태그가 없습니다. 검색어를 변경해 보세요.
          </div>
        )}
      </div>
    </div>
  );
}
