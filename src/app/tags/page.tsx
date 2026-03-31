import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllTags } from '@/lib/posts';

export const metadata: Metadata = {
  title: '태그 클라우드',
  description: '모든 태그를 한눈에 볼 수 있는 태그 클라우드입니다.',
};

type TagInfo = {
  tag: string;
  count: number;
};

function getTagSize(count: number, minCount: number, maxCount: number) {
  if (minCount === maxCount) {
    return 1.1;
  }

  const normalized = (count - minCount) / (maxCount - minCount);
  return 0.95 + normalized * 1.2;
}

export default async function TagsPage() {
  const tags = await getAllTags();
  const counts = tags.map((item) => item.count);
  const minCount = Math.min(...counts, 0);
  const maxCount = Math.max(...counts, 0);

  return (
    <main className="container mx-auto px-4 py-8">
      <section className="mb-10">
        <h1 className="text-3xl font-semibold text-gray-900">태그 클라우드</h1>
        <p className="mt-3 text-gray-600">
          사용된 태그를 한눈에 볼 수 있습니다. 태그를 클릭하면 해당 태그가 적용된 게시글 목록으로 이동합니다.
        </p>
      </section>

      <section className="">
        {tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {tags.map((item: TagInfo) => (
              <Link
                key={item.tag}
                href={`/tags/${encodeURIComponent(item.tag)}`}
                className="inline-flex items-center px-3 text-gray-800 transition-colors duration-200 hover:text-blue-700"
                style={{ fontSize: `${getTagSize(item.count, minCount, maxCount)}rem` }}
              >
                <span className="font-medium">#{item.tag}</span>
                <span className="ml-2 text-xs text-gray-500">{item.count}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            아직 등록된 태그가 없습니다.
          </div>
        )}
      </section>
    </main>
  );
}
