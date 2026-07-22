import type { Metadata } from 'next';
import { getPostsByTag } from '@/lib/posts';
import TagPostList from './tag-post-list';
import { auth } from '@/auth';

type Props = Promise<{ tag: string }>;

// SEO를 위한 동적 메타데이터 생성
export async function generateMetadata(props: {
    params: Props
}): Promise<Metadata> {
  // URL에 포함된 태그는 인코딩되어 있으므로 디코딩합니다.
  const params = await props.params;
  const decodedTag = decodeURIComponent(params.tag);
  return {
    title: `#${decodedTag} 태그 검색 결과`,
    description: `'${decodedTag}' 태그가 포함된 모든 게시글 목록입니다.`,
  };
}

export default async function TagPage(props: {
    params: Props
}) {
    const params = await props.params;
  const decodedTag = decodeURIComponent(params.tag);
  const session = await auth(); // 로그인 작성자는 자기 비공개 글도 태그 목록에 포함
  const {posts} = await getPostsByTag(decodedTag, session?.user?.email ?? null);

  return (
        <main className="mx-auto px-4 py-6">
      <section className="mt-12">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4"><span className="text-blue-500 pe-1">#</span>{decodedTag}</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400 py-4">{posts.length}개의 게시글이 있습니다.</p>

      {posts.length > 0 ? (
        <TagPostList posts={posts} />
      ) : (
        <div className="text-center py-16">
          <p className="text-gray-500 dark:text-gray-400">해당 태그가 달린 게시글이 없습니다.</p>
        </div>
      )}
    </section>
  </main>
);
}