import type { Metadata } from 'next';
import { getPostsByTag } from '@/lib/posts';
import PostItem from '@/components/post-item';

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
  const {posts} = await getPostsByTag(decodedTag);

  return (
        <main className="container mx-auto px-4 py-6">
      <section className="mt-12">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4"><span className="text-blue-500 pe-1">#</span>{decodedTag}</h2>
        <p className="mt-2 text-gray-600 py-4">{posts.length}개의 게시글이 있습니다.</p>

      {posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map((post) => 
            <PostItem key={post._id} post={post} isOpen={false} togglePost={undefined} />
          )}
        </div>
      ) : (
        <div className="text-center py-16">
          <p className="text-gray-500">해당 태그가 달린 게시글이 없습니다.</p>
        </div>
      )}
    </section>
  </main>
);
}