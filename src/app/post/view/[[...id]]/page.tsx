import { getPost, updatePostViews } from '@/lib/posts';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PostViewContainer from './post-view-container';

type Params = Promise<{ id: string[] }>

export async function generateMetadata(props: { params: Params }): Promise<Metadata> {
    const params = await props.params;
    const _id = params.id?.[0];

    if (!_id) return { title: 'Post Not Found' };

    const { post } = (await getPost(_id)) || { post: null };
    if (!post) return { title: 'Post Not Found' };

    const description = post.htmlContent
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160);

    return {
        title: post.title,
        description,
        keywords: post.tags,
    };
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

    return (
        <PostViewContainer
            post={{
                _id: post._id.toString(),
                title: post.title,
                jsonContent: post.jsonContent,
                likes: post.likes,
                tags: post.tags ?? [],
                userEmail: post.userEmail,
            }}
        />
    );
}
