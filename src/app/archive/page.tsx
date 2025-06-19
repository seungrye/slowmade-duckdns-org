import { getPosts } from "@/lib/posts";
import { SortOption, isValidSortOption } from "@/lib/sort";
import "@/app/archive/page.css"; // CSS 파일 임포트

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ArchivePage({ searchParams }: Props) {
  const params = await searchParams;
  const rawSort = params.sort as string | undefined; // 쿼리 파라미터에서 sort 값 가져오기

  const sortOption: SortOption = isValidSortOption(rawSort) ? rawSort : 'latest';
  /*const {posts} =*/ await getPosts(sortOption); // 정렬 기준에 따라 게시글 불러오기

  return (
    <main className="container mx-auto px-4 py-6">
      {/* 제목 */}
      <section className="text-center py-6">
        {/* TODO: https://codepen.io/Naasa21/pen/qdxKMo/ 이런 모양으로 연도 선택할수 있도록 해야 함 */}
        <h1 className="text-3xl font-bold text-gray-800">🔥 최신 유머 모음</h1>
        <p className="text-gray-600 mt-2">최근 업로드된 유머를 확인해 보세요.</p>
      </section>

      {/* 정렬 옵션 */}
      {/* <div className="flex justify-end mb-4">
        <SelectSorter current={sortOption} />
      </div> */}

<section className="max-w-4xl mx-auto px-4">
  {/* <div className="max-w-4xl mx-auto px-4">
    <header className="mb-12 text-center">
      <h2 className="text-4xl md:text-6xl font-bold text-white">Timeline</h2>
      <p className="uppercase text-white mt-2 text-sm">What is this?</p>
    </header> */}

    <ul className="relative border-l-4 border-gray-300 timeline-list">
      <li className="relative pl-8 mb-12">
        <div className="absolute left-[-0.75rem] top-0 w-6 h-6 bg-teal-600 border-4 border-white rounded-full reveal-dot"></div>
        <div className="reveal-from-left delay-0">
          <h3 className="text-xl font-bold text-gray-800 mb-2">January, a.k.a 1월</h3>
          <div className="flex flex-wrap gap-2">
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
        </div>
        </div>
      </li>
 
      <li className="relative pl-8 mb-12">
        <div className="absolute left-[-0.75rem] top-0 w-6 h-6 bg-teal-600 border-4 border-white rounded-full reveal-dot"></div>
        <div className="reveal-from-left delay-1">
          <h3 className="text-xl font-bold text-gray-800 mb-2">February, a.k.a 2월</h3>
          <div className="flex flex-wrap gap-2">
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
          </div>
        </div>
      </li>
 
      <li className="relative pl-8 mb-12">
        <div className="absolute left-[-0.75rem] top-0 w-6 h-6 bg-teal-600 border-4 border-white rounded-full reveal-dot"></div>
        <div className="reveal-from-left delay-2">
          <h3 className="text-xl font-bold text-gray-800 mb-2">March, a.k.a 3월</h3>
          <div className="flex flex-wrap gap-2">
            <div className="w-3 h-3 md:w-4 lg:w-5 md:h-4 lg:h-5 rounded-xs border"/>
        </div>
        </div>
      </li>
 
    </ul>
  {/* </div> */}
</section>

      {/* 유머 리스트 */}
        {/* <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {posts.map((post: GetPostType) => (
            <div key={post._id} className="bg-white rounded-lg shadow-md p-4">
              <Image
                src={`/humor-${"default"}.jpg`}
                alt={post.title}
                width={300}
                height={200}
                className="rounded-md"
              />
              <h3 className="mt-3 text-lg font-semibold">{post.title}</h3>
              <p className="text-gray-500 text-sm">
                조회수 {formatNumber(post.views)} • 댓글 {32}
              </p>
              <Link href={`/humor/${post._id}`} className="text-blue-500 mt-2 block">
                더 보기 →
              </Link>
            </div>
          ))}
        </section> */}

      {/* 페이지네이션 */}
      {/* <div className="flex justify-center mt-8">
        <button className="bg-gray-300 px-4 py-2 rounded-l">◀ 이전</button>
        <span className="px-4 py-2 bg-gray-100">1 / 10</span>
        <button className="bg-gray-300 px-4 py-2 rounded-r">다음 ▶</button>
      </div> */}

      {/* 유머 업로드 버튼 */}
      {/* <div className="text-center mt-10">
        <Link href="/upload" className="bg-blue-500 text-white px-6 py-3 rounded-lg shadow-md hover:bg-blue-600 transition">
          ✨ 유머 업로드하기
        </Link>
      </div> */}
    </main>
  );
}
