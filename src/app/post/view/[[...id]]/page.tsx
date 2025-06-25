
import '@/app/post/view/[[...id]]/page.css';
import { RichContentViewer } from '@/components/rich-web-editor/viewer';
import { getPost } from '@/lib/posts';

type Params = Promise<{ id: string[] }>
// type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

function ipv4ToObfuscatedBase6(ip: string): string {
    const charset = "ill|!I"; // 6진수용 6글자
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some(n => n < 0 || n > 255)) {
      throw new Error("Invalid IPv4 address");
    }
  
    // 음수 방지: 부호 없는 정수 변환
    const intVal = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;

    // 정수 → 6진수 변환 → 문자셋 변환
    let result = "";
    let value = intVal;

    if (value === 0) return charset[0]; // edge case for 0.0.0.0

    while (value > 0) {
      const remainder = value % 6;
      result = charset[remainder] + result;
      value = Math.floor(value / 6);
    }

    return result;
}

export default async function PostViewier(props: {
    params: Params
    // searchParams: SearchParams
  }) {
    const params = await props.params
    // const searchParams = await props.searchParams
    const _id = params.id?.[0]
    // const query = searchParams.query

    const { post } = await getPost(_id) || { post: null };    
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
            <h2 className="text-xl font-semibold mb-2">3 Comments</h2>

            {/* 댓글 목록 */}
            <div className="space-y-4">
                {/* 개별 댓글 */}
                <div className="flex items-start gap-4 border border-gray-200 rounded-lg rounded-br-none p-4">
                    {/* <img className="w-10 h-10 rounded-full" src="https://flowbite.com/docs/images/people/profile-picture-1.jpg" alt="User avatar" /> */}
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900 dark:text-white font-mono">{ipv4ToObfuscatedBase6("192.168.0.1")}</h3>
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
                <div className="ml-6 md:ml-12 flex items-start gap-4 border border-gray-200 rounded-lg rounded-br-none p-4">
                    {/* <img className="w-10 h-10 rounded-full" src="https://flowbite.com/docs/images/people/profile-picture-3.jpg" alt="Reply user avatar" /> */}
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900 dark:text-white font-mono">{ipv4ToObfuscatedBase6("192.168.0.1")}</h3>
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
                <div className="flex items-start gap-4 border border-gray-200 rounded-lg rounded-br-none p-4">
                    {/* <img className="w-10 h-10 rounded-full" src="https://flowbite.com/docs/images/people/profile-picture-5.jpg" alt="User avatar" /> */}
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900 dark:text-white font-mono">{ipv4ToObfuscatedBase6("101.101.101.101")}</h3>
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
                <textarea id="comment" rows={4} className="min-h-20 block w-full p-3 text-sm text-gray-900 bg-gray-50 border border-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white" placeholder="Write your comment here..."></textarea>
                <button type="submit" className="mt-4 md:mt-0 inline-flex justify-end items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-300 dark:bg-blue-500 dark:hover:bg-blue-600">
                    Post comment
                </button>
            </form>
        </div>
    </div>
    );
}
