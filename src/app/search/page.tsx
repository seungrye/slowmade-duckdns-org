import Link from "next/link";
import Image from "next/image";
import SelectSorter from "@/components/select-sorter";
import { SortOption, isValidSortOption } from "@/lib/sort";
import InputSearch from "@/components/input-search";
import { formatNumber } from "@/lib/format";
import { searchPosts } from "@/lib/posts";

type SearchPageProps = {
  searchParams: {
    sort?: string;
    query?: string;
  };
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const rawSort = searchParams?.sort;
  const sortOption: SortOption = isValidSortOption(rawSort) ? rawSort : 'latest';

  const rawQuery = searchParams?.query;
  const query = rawQuery ? decodeURIComponent(rawQuery) : "";

  const posts = await searchPosts(query, sortOption); // 정렬 기준에 따라 검색한 게시글 불러오기

  return (
    <main className="container mx-auto px-4 py-6">
      {/* 검색 입력창 */}
      <section className="text-center py-6">
        <h1 className="text-3xl font-bold text-gray-800">🔍 유머 검색</h1>
        <p className="text-gray-600 mt-2">찾고 싶은 유머를 검색해 보세요.</p>
        <div className="mt-4 flex justify-center">
          <InputSearch current={query} />
        </div>
      </section>

      {/* 정렬 옵션 */}
      <div className="flex justify-end mb-4">
        <SelectSorter current={sortOption} />
      </div>

      {/* 검색 결과 리스트 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {posts.length > 0 ? (
          posts.map((post: any) => (
            <div key={post._id} className="bg-white rounded-lg shadow-md p-4">
              <Image
                src={`/humor-${post.imageId ?? "default"}.jpg`}
                alt={post.title} width={300} height={200} className="rounded-md" />
              <h3 className="mt-3 text-lg font-semibold">{post.title}</h3>
              <p className="text-gray-500 text-sm">
                조회수 {formatNumber(post.views)} • 댓글 {32}
              </p>
              <Link href={`/humor/${post._id}`} className="text-blue-500 mt-2 block">더 보기 →</Link>
            </div>
          ))
        ) : (
          <p className="text-gray-500 col-span-3 text-center">😢 검색 결과가 없습니다.</p>
        )}
      </section>

      {/* 페이지네이션 */}
      <div className="flex justify-center mt-8">
        <button className="bg-gray-300 px-4 py-2 rounded-l">◀ 이전</button>
        <span className="px-4 py-2 bg-gray-100">1 / 10</span>
        <button className="bg-gray-300 px-4 py-2 rounded-r">다음 ▶</button>
      </div>
    </main>
  );
}
