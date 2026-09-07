import { getPost, getAllPostIds } from '@/lib/posts';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PostViewContainer from './post-view-container';
import PostViewTracker from './post-view-tracker';
import { buildArticleJsonLd } from './article-json-ld';
import { buildPostMetadata } from './build-post-metadata';
import { env } from '@/lib/env';
import PrivatePostGate from './private-post-gate';
import CommentAnchor from './comment-anchor.client';

type Params = Promise<{ id: string[] }>

const siteUrl = env.siteUrl;

/**
 * Only public posts are loaded on the server (a public filter). It **never calls auth() (cookies)**, so static
 * generation and caching hold (no clash with generateStaticParams + revalidate -> DYNAMIC_SERVER_USAGE avoided).
 * When it is not found as public (private or absent) the server makes no judgement, and the client gate (PrivatePostGate)
 * checks through the authenticated API (/api/post) whether the viewer is the author, then renders.
 */
async function loadPublicPost(_id: string) {
  const pub = await getPost(_id);
  return pub?.post ?? null;
}

// generateStaticParams (public posts) generates statically at build time -> a public post is fast, from a cached static render.
// revalidate (time-based ISR) is removed: a private post falls outside the static set and renders on demand, and it then
// reads auth() (cookies) to judge authorship, so coexisting with revalidate blows up with
// DYNAMIC_SERVER_USAGE. Dropping revalidate keeps public posts static while private ones render dynamically (authenticated).
// Reflecting an 'edit' of a public post is handled by the submit route's revalidatePath('/post/view/{id}').

// A dynamic route ([[...id]]) needs generateStaticParams to be generated statically.
// Existing public posts are generated at build time; the rest (new or private) come on demand through dynamicParams (true by default).
export async function generateStaticParams() {
    const ids = await getAllPostIds();
    return ids.map((id) => ({ id: [id] }));
}

export async function generateMetadata(props: { params: Params }): Promise<Metadata> {
    const params = await props.params;
    const _id = params.id?.[0];

    if (!_id) return { title: 'Post Not Found' };

    const post = await loadPublicPost(_id); // Metadata is exposed for public posts only (a private one is rendered by the client gate)
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
    // Not found as public may mean private, so the client gate takes over (rendering, authenticated, for the author alone). A missing post also gets 'not found' from the gate.
    // A private post has to scroll to the anchor too - notifications mostly target private (AI team) posts (#241).
    if (!post) return <><CommentAnchor /><PrivatePostGate id={_id} /></>;

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
            <CommentAnchor />
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
