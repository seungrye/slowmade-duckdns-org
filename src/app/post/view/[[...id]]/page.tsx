
import { RichContentViewer } from '@/components/rich-web-editor/viewer';
import Comments from '@/app/post/view/[[...id]]/comments.section';
import { getPost, updatePostViews } from '@/lib/posts';
import LikeSection from './like.section';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

type Params = Promise<{ id: string[] }>
// type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export async function generateMetadata(
    props: {
        params: Params
        // searchParams: SearchParams
    },
    // parent: ResolvingMetadata
): Promise<Metadata> {
    const params = await props.params
    // const searchParams = await props.searchParams
    const _id = params.id?.[0]

    if (!_id) {
        return {
            title: 'Post Not Found',
        };
    }

    // API 또는 DB에서 게시물 데이터를 가져옵니다.
    const { post } = (await getPost(_id)) || { post: null };

    if (!post) {
        return {
            title: 'Post Not Found',
        };
    }

    // 동적으로 제목을 생성하여 반환합니다.
    return {
        title: post.title,
        description: `Author: ${post.author},
        Title: '${post.title}',
        Likes: ${post.likes},
        Views: ${post.views},
        Created At: ${post.createdAt.toLocaleDateString()}`,
        keywords: post.tags, // 태그를 SEO 키워드로 활용합니다.
    };
}

export default async function PostViewier(props: {
    params: Params
    // searchParams: SearchParams
}) {
    const params = await props.params
    // const searchParams = await props.searchParams
    const { id } = params; // id: string | string[] | undefined
    const _id = Array.isArray(id) ? id[0] : id;

    // const query = searchParams.query
    if (!_id) {
        notFound();
    }

    const data = await getPost(_id);
    if (!data?.post) {
        notFound();
    }

    // The post is guaranteed to exist here.
    const { post } = data;
    await updatePostViews(post._id);

    const { jsonContent, title, likes, tags } = post;

    return (<div className='mx-auto px-4 py-6'>
        <div className="border border-gray-300 rounded-b-none rounded-lg mb-4 has-focus:shadow-sm">
            <div className='w-full p-3 font-bold md:text-lg'>
                {title}
            </div>
        </div>
        <div className="border border-gray-300 has-focus:shadow-sm rounded-b-lg min-h-[600px] rich-web-editor-wrapper flex flex-col">
            <div className="p-4 transition-all duration-300 ease-in-out flex-1">
                <RichContentViewer content={jsonContent} waitRenderComplete={true} />
            </div>

            {/* 태그 목록 렌더링 */}
            {tags && tags.length > 0 && (
                <div className="p-3 text-sm text-gray-600 border-t border-t-gray-200">
                    <div className="flex flex-wrap items-center gap-3">
                        {tags.map((tag: string) => (
                            <Link href={`/tags/${encodeURIComponent(tag)}`} key={tag} className="bg-gray-100 text-gray-700 text-sm font-medium px-3 py-1 rounded-full hover:bg-gray-200 transition-colors duration-200">
                                # {tag}
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            <LikeSection defaultLikes={likes} _id={post._id} />
        </div>

        <div className="mt-6">
            <Comments postId={post._id} />
        </div>
    </div>
    );
}
