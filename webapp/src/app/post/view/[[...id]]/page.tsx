import { getPost, getAllPostIds } from '@/lib/posts';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PostViewContainer from './post-view-container';
import PostViewTracker from './post-view-tracker';
import { buildArticleJsonLd } from './article-json-ld';
import { buildPostMetadata } from './build-post-metadata';
import { env } from '@/lib/env';
import { auth } from '@/auth';

type Params = Promise<{ id: string[] }>

const siteUrl = env.siteUrl;

/**
 * 뷰어가 볼 수 있는 글을 로드한다. **공개 글은 auth() 를 타지 않아 ISR 정적 캐시가 유지**되고,
 * 공개 필터로 못 찾으면(비공개 가능성) auth() 로 작성자 본인인지 확인해 동적으로 렌더한다.
 * (비공개 글은 generateStaticParams 에서 제외되므로 정적 캐시에 담기지 않는다.)
 */
async function loadViewablePost(_id: string) {
  const pub = await getPost(_id); // 공개 필터 — auth 미호출
  if (pub?.post) return pub.post;
  const session = await auth(); // 여기서부터 동적 렌더(쿠키)
  const viewer = session?.user?.email ?? null;
  if (!viewer) return null;
  const priv = await getPost(_id, viewer);
  return priv?.post ?? null;
}

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

    const post = await loadViewablePost(_id);
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

    const post = await loadViewablePost(_id);
    if (!post) notFound();

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
            <PostViewTracker id={post._id.toString()} skip={!!post.isPrivate} />
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
                    isPrivate: !!post.isPrivate,
                    attachments: (post.attachments ?? []).map((a) => ({
                        name: a.name ?? '',
                        size: a.size ?? 0,
                        mimeType: a.mimeType ?? '',
                    })),
                }}
            />
        </>
    );
}
