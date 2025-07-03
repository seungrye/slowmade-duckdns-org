
import '@/app/post/view/[[...id]]/page.css';
import { RichContentViewer } from '@/components/rich-web-editor/viewer';
import Comments from '@/components/comments';
import { getPost, updatePostViews } from '@/lib/posts';

type Params = Promise<{ id: string[] }>
// type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function PostViewier(props: {
    params: Params
    // searchParams: SearchParams
}) {
    const params = await props.params
    // const searchParams = await props.searchParams
    const _id = params.id?.[0]
    // const query = searchParams.query

    const { post } = await getPost(_id) || { post: null };
    if (post) await updatePostViews(_id);
    const { htmlContent, title } = post || { htmlContent: '', title: '' };

    return (<div className='mx-auto px-4 py-6'>
        <div className="border border-gray-300 rounded-b-none rounded-lg mb-4 has-focus:shadow-sm">
            <div className='w-full p-3 font-bold md:text-lg'>
                {title}
            </div>
        </div>
        <div className="border border-gray-300 has-focus:shadow-sm rounded-b-lg min-h-[600px] upload-editor-wrapper">
            <div className="p-4 transition-all duration-300 ease-in-out">
                <RichContentViewer content={htmlContent} />
            </div>
        </div>

        <div className="mt-6">
            <Comments postId={_id} />
        </div>
    </div>
    );
}
