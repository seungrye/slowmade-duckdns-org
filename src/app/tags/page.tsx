export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { getAllTags } from '@/lib/posts';
import TagCloudSearch from './tag-cloud-search';

export const metadata: Metadata = {
  title: '태그 클라우드',
  description: '모든 태그를 한눈에 볼 수 있는 태그 클라우드입니다.',
};

export default async function TagsPage() {
  const tags = await getAllTags();

  return (
    <main className="mx-auto px-4 py-8">
      <section className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-900">태그 클라우드</h1>
        <p className="mt-3 text-gray-600">
          사용된 태그를 한눈에 볼 수 있습니다. 태그를 클릭하면 해당 태그가 적용된 게시글 목록으로 이동합니다.
        </p>
      </section>

      <section>
        <TagCloudSearch initialTags={tags} />
      </section>
    </main>
  );
}
