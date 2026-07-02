import { getPost, getAllPostIds } from '@/lib/posts';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PostViewContainer from './post-view-container';
import PostViewTracker from './post-view-tracker';
import { buildArticleJsonLd } from './article-json-ld';
import { buildPostMetadata } from './build-post-metadata';
import { env } from '@/lib/env';

type Params = Promise<{ id: string[] }>

const siteUrl = env.siteUrl;

// 조회수 write 를 client(PostViewTracker)로 분리했으므로 렌더가 순수해져 ISR 캐싱이 가능.
// 글 수정/삭제는 최대 이 주기(초) 후 반영되고, 좋아요·댓글은 client 가 최신값을 로드한다.
export const revalidate = 60;

// dynamic route([[...id]])는 generateStaticParams 가 있어야 ISR 로 캐싱된다.
// 기존 글은 빌드 시 정적 생성, 빌드 후 작성된 글은 dynamicParams(기본 true)로 첫 요청 시 생성.
export async function generateStaticParams() {
    const ids = await getAllPostIds();
    return ids.map((id) => ({ id: [id] }));
}

export async function generateMetadata(props: { params: Params }): Promise<Metadata> {
    const params = await props.params;
    const _id = params.id?.[0];

    if (!_id) return { title: 'Post Not Found' };

    const { post } = (await getPost(_id)) || { post: null };
    if (!post) return { title: 'Post Not Found' };

    return buildPostMetadata({
        id: _id,
        title: post.title,
        htmlContent: post.htmlContent,
        author: post.author,
        createdAt: post.createdAt as Date,
        tags: post.tags ?? [],
        siteUrl,
    });
}

export default async function PostViewer(props: { params: Params }) {
    const params = await props.params;
    const { id } = params;
    const _id = Array.isArray(id) ? id[0] : id;

    if (!_id) notFound();

    const data = await getPost(_id);
    if (!data?.post) notFound();

    const { post } = data;

    const url = `${siteUrl}/post/view/${_id}`;
    const description = post.htmlContent
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);

    const jsonLd = buildArticleJsonLd({
        title: post.title,
        description,
        author: post.author,
        createdAt: post.createdAt as Date,
        tags: post.tags ?? [],
        url,
    });

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026') }}
            />
            <PostViewTracker id={post._id.toString()} />
            <PostViewContainer
                post={{
                    _id: post._id.toString(),
                    title: post.title,
                    jsonContent: post.jsonContent,
                    likes: post.likes,
                    tags: post.tags ?? [],
                    userEmail: post.userEmail,
                    author: post.author,
                    createdAt: (post.createdAt as Date).toISOString(),
                }}
            />
        </>
    );
}
