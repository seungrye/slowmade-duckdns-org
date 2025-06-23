
import '@/app/post/view/[[...id]]/page.css';
import { RichContentViewer } from '@/components/rich-web-editor/viewer';

type Props = {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
  };
  
export default async function PostViewier({ searchParams }: Props) {
    const params = await searchParams;
    const _id = params._id as string | undefined;

    return (<div className=''>
        <div className="border border-gray-300 rounded-b-none rounded-lg mb-4 has-focus:shadow-sm">
            <div className='w-full p-3'>
                이것은 타이틀 입니다.
            </div>
        </div>
        <div className="border border-gray-300 has-focus:shadow-sm rounded-b-lg min-h-[600px] h-[600px] upload-editor-wrapper">
            <div className="p-4 transition-all duration-300 ease-in-out">
                <RichContentViewer content='<p>한글이 잘 나오는 내용입니다.</p><p><br class="ProseMirror-trailingBreak"></p><p>음식이 가지고 있는</p><p>실제로 다 <code>칼로리가</code> 있죠. <strong>규정상</strong> 얼마 이하는</p>'/>
            </div>
        </div>

        <div className="mt-4">
            <div className="border border-gray-300 rounded-lg mb-2 has-focus:shadow-sm">
                <div className='w-full p-3'>
                    TODO: comments
                </div>
            </div>
            <div className="border border-gray-300 rounded-lg mb-2 has-focus:shadow-sm">
                <div className='w-full p-3'>
                    TODO: comments
                </div>
            </div>

            {/* <button
                onClick={handleSubmit}
                className={`bg-blue-500 hover:bg-blue-600 text-white font-medium px-4 py-2 rounded-lg transition duration-200 ${loading && "opacity-50 cursor-not-allowed"}`}
                disabled={loading}
            >
                {loading ? "업로드 중..." : "Submit"}
            </button> */}
        </div>
    </div>
    );
}
