export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { auth } from '@/auth';
import { getAllTags } from '@/lib/posts';
import TagCloudSearch from './tag-cloud-search';

export const metadata: Metadata = {
  title: '태그 클라우드',
  description: '모든 태그를 한눈에 볼 수 있는 태그 클라우드입니다.',
};

export default async function TagsPage() {
  // 로그인 작성자에게는 자기 비공개 글의 태그도 보여 준다 (#230) —
  // 개별 태그 페이지(`/tags/[tag]`)가 이미 그렇게 동작하는데 여기만 빠져 있었다.
  // 이 페이지는 force-dynamic 이라 세션을 읽어도 캐시 문제가 없다.
  const session = await auth();
  const tags = await getAllTags(session?.user?.email ?? null);

  return (
    <main className="mx-auto px-4 py-8">
      <section className="mb-6">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100">태그 클라우드</h1>
        <p className="mt-3 text-gray-600 dark:text-gray-400">
          사용된 태그를 한눈에 볼 수 있습니다. 태그를 클릭하면 해당 태그가 적용된 게시글 목록으로 이동합니다.
        </p>
      </section>

      <section>
        <TagCloudSearch initialTags={tags} />
      </section>
    </main>
  );
}
