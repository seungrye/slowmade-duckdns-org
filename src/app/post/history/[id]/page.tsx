import { getPost } from '@/lib/posts';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPostRevisions } from '@/lib/revisions';

type Props = Promise<{ id: string }>;

export async function generateMetadata(props: {
    params: Props
}): Promise<Metadata> {
    const params = await props.params;
    const postId = params.id;

    // id가 없으면 기본 메타데이터 반환
    if (!postId) return { title: '변경 이력' };

    const { post } = (await getPost(postId)) || { post: null };

    // 게시글이 없으면 404 페이지와 유사한 제목 반환
    if (!post) return { title: '게시글을 찾을 수 없음' };

    return { title: `"${post.title}"의 변경 이력` };
}

export default async function PostHistoryPage(props: {
    params: Props
}) {
    const params = await props.params;
    const postId = params.id;

    const allRevisions = await getPostRevisions(postId);

    // getPostRevisions가 null을 반환하면 게시글이 없는 것이므로 404 페이지를 표시합니다.
    if (allRevisions === null) {
        notFound();
    }

    return (
        <div className="mx-auto px-4 py-6">
            <h1 className="text-3xl font-bold mb-4">게시글 변경 이력</h1>
            <p className="mb-6 text-gray-600">
                <Link href={`/post/view/${postId}`} className="text-blue-500 hover:text-blue-700">
                    &larr; 현재 게시글로 돌아가기
                </Link>
            </p>

            {allRevisions.length > 0 ? (
                <ul className="border border-gray-200 rounded-lg">
                    {allRevisions.map((revision, index) => (
                        <li key={revision._id} className={`p-4 ${index < allRevisions.length - 1 ? 'border-b border-gray-200' : ''}`}>
                            <div className="flex justify-between items-center">
                                <div>
                                    <span className="font-semibold text-lg">버전 {revision.version}</span>
                                    <p className="text-gray-800">{revision.title}</p>
                                </div>
                                <div className="text-right text-sm text-gray-500">
                                    <p>{revision.author || '알 수 없음'}</p>
                                    <p>{new Date(revision.createdAt).toLocaleString()}</p>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <p>변경 이력이 없습니다.</p>
            )}
        </div>
    );
}