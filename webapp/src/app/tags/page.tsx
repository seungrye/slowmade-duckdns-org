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
  // A logged-in author is shown the tags of their own private posts too (#230) -
  // the individual tag page (`/tags/[tag]`) already worked that way and this one alone did not.
  // This page is force-dynamic, so reading the session causes no caching problem.
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
