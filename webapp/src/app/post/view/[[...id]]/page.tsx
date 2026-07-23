import { getPost, getAllPostIds } from '@/lib/posts';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PostViewContainer from './post-view-container';
import PostViewTracker from './post-view-tracker';
import { buildArticleJsonLd } from './article-json-ld';
import { buildPostMetadata } from './build-post-metadata';
import { env } from '@/lib/env';
import PrivatePostGate from './private-post-gate';

type Params = Promise<{ id: string[] }>

const siteUrl = env.siteUrl;

/**
 * 공개 글만 서버에서 로드한다(공개 필터). **auth()(쿠키)를 절대 호출하지 않아** 정적 생성/캐시가
 * 유지된다(generateStaticParams + revalidate 와 충돌 없음 → DYNAMIC_SERVER_USAGE 회피).
 * 공개로 못 찾으면(비공개 or 없음) 서버는 판단하지 않고, 클라이언트 게이트(PrivatePostGate)가
 * 인증 API(/api/post)로 작성자 본인인지 확인해 렌더한다.
 */
async function loadPublicPost(_id: string) {
  const pub = await getPost(_id);
  return pub?.post ?? null;
}

// generateStaticParams(공개 글)로 빌드 시 정적 생성 → 공개 글은 캐시된 정적 렌더로 빠르다.
// revalidate(시간 ISR)는 제거: 비공개 글은 정적 대상에서 빠져 on-demand 로 렌더되는데, 그때
// 작성자 판정을 위해 auth()(쿠키)를 읽으므로 revalidate 와 공존하면 DYNAMIC_SERVER_USAGE 로
// 터진다. revalidate 를 빼면 공개 글은 정적 유지·비공개 글은 동적(인증) 렌더가 가능하다.
// 공개 글 '수정' 반영은 submit 라우트의 revalidatePath('/post/view/{id}') 로 처리한다.

// dynamic route([[...id]])는 generateStaticParams 가 있어야 정적 생성된다.
// 기존 공개 글은 빌드 시 정적 생성, 그 외(신규·비공개)는 dynamicParams(기본 true)로 on-demand.
export async function generateStaticParams() {
    const ids = await getAllPostIds();
    return ids.map((id) => ({ id: [id] }));
}

export async function generateMetadata(props: { params: Params }): Promise<Metadata> {
    const params = await props.params;
    const _id = params.id?.[0];

    if (!_id) return { title: 'Post Not Found' };

    const post = await loadPublicPost(_id); // 공개 글만 메타 노출(비공개는 클라 게이트가 렌더)
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

    const post = await loadPublicPost(_id);
    // 공개로 못 찾으면 비공개일 수 있으니 클라 게이트로(작성자 본인만 인증 렌더). 없는 글도 게이트가 '찾을 수 없음'.
    if (!post) return <PrivatePostGate id={_id} />;

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
                    aiTags: post.aiTags ?? [],
                    userEmail: post.userEmail,
                    author: post.author,
                    createdAt: (post.createdAt as Date).toISOString(),
                    isPrivate: !!post.isPrivate,
                    attachments: (post.attachments ?? []).map((a) => ({
                        id: a.id ?? "", name: a.name ?? "", size: a.size ?? 0, mimeType: a.mimeType ?? "",
                    })),
                }}
            />
        </>
    );
}
