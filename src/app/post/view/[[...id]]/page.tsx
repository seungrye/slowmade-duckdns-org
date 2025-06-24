
import '@/app/post/view/[[...id]]/page.css';
import { RichContentViewer } from '@/components/rich-web-editor/viewer';

type Props = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PostViewier({ searchParams }: Props) {
    const params = await searchParams;
    const _id = params._id as string | undefined;

    console.log(_id);

    return (<div className='mx-auto px-4 py-6'>
        <div className="border border-gray-300 rounded-b-none rounded-lg mb-4 has-focus:shadow-sm">
            <div className='w-full p-3'>
                이것은 타이틀 입니다.
            </div>
        </div>
        <div className="border border-gray-300 has-focus:shadow-sm rounded-b-lg min-h-[600px] h-[600px] upload-editor-wrapper">
            <div className="p-4 transition-all duration-300 ease-in-out">
                <RichContentViewer content='<p>한글이 잘 나오는 내용입니다.</p><p><br class="ProseMirror-trailingBreak"></p><p>음식이 가지고 있는</p><p>실제로 다 <code>칼로리가</code> 있죠. <strong>규정상</strong> 얼마 이하는</p>' />
            </div>
        </div>

        <div className="mt-4">
            <h2 className="text-xl font-semibold mb-6">3 Comments</h2>

            {/* 댓글 목록 */}
            <div className="space-y-4">
                {/* 개별 댓글 */}
                <div className="flex items-start gap-4 border border-gray-300 rounded-lg p-4">
                    <img className="w-10 h-10 rounded-full" src="https://flowbite.com/docs/images/people/profile-picture-1.jpg" alt="User avatar" />
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900 dark:text-white">Bonnie Green</h3>
                            <span className="text-sm text-gray-500">·</span>
                            <span className="text-sm text-gray-500">Feb. 8, 2022</span>
                        </div>
                        <p className="text-gray-700 dark:text-gray-300 mt-1">
                            This is a really insightful post. Thanks for sharing!
                        </p>
                        <button className="text-sm text-blue-600 hover:underline mt-2">Reply</button>
                    </div>
                </div>

                {/* 대댓글 */}
                <div className="ml-12 flex items-start gap-4 border border-gray-300 rounded-lg p-4">
                    <img className="w-10 h-10 rounded-full" src="https://flowbite.com/docs/images/people/profile-picture-3.jpg" alt="Reply user avatar" />
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900 dark:text-white">Jese Leos</h3>
                            <span className="text-sm text-gray-500">·</span>
                            <span className="text-sm text-gray-500">Feb. 9, 2022</span>
                        </div>
                        <p className="text-gray-700 dark:text-gray-300 mt-1">
                            Totally agree with you, Bonnie. Well said!
                        </p>
                        <button className="text-sm text-blue-600 hover:underline mt-2">Reply</button>
                    </div>
                </div>

                {/* 또 다른 댓글 */}
                <div className="flex items-start gap-4 border border-gray-300 rounded-lg p-4">
                    <img className="w-10 h-10 rounded-full" src="https://flowbite.com/docs/images/people/profile-picture-5.jpg" alt="User avatar" />
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900 dark:text-white">Leslie Livingston</h3>
                            <span className="text-sm text-gray-500">·</span>
                            <span className="text-sm text-gray-500">Feb. 10, 2022</span>
                        </div>
                        <p className="text-gray-700 dark:text-gray-300 mt-1">
                            I have a slightly different take, but I still appreciate the perspective.
                        </p>
                        <button className="text-sm text-blue-600 hover:underline mt-2">Reply</button>
                    </div>
                </div>
            </div>

            {/* 댓글 작성 폼 */}
            <form className="mt-4 flex flex-col md:flex-row md:items-stretch md:gap-4">
                <label htmlFor="comment" className="sr-only">Add a comment</label>
                <textarea id="comment" rows={4} className="min-h-20 block w-full p-3 text-sm text-gray-900 bg-gray-50 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white" placeholder="Write your comment here..."></textarea>
                <button type="submit" className="mt-4 md:mt-0 inline-flex justify-end items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 dark:bg-blue-500 dark:hover:bg-blue-600">
                    Post comment
                </button>
            </form>
        </div>
    </div>
    );
}
