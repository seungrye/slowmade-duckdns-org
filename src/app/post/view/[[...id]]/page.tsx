import { getPost, updatePostViews } from '@/lib/posts';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PostViewContainer from './post-view-container';
import { buildArticleJsonLd } from './article-json-ld';
import { buildPostMetadata } from './build-post-metadata';

type Params = Promise<{ id: string[] }>

const siteUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

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
    await updatePostViews(post._id);

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
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
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
