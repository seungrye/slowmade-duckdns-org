import Link from "next/link";
import Image from "next/image";
import { getPosts } from "@/lib/posts";
import { formatNumber } from "@/lib/format";
import { SortOption, isValidSortOption } from "@/lib/sort";
import SelectSorter from "@/components/select-sorter";

type ArchivePageProps = {
  archiveParams: {
    sort?: string;
  };
};

export default async function ArchivePage({ archiveParams }: ArchivePageProps) {
    const rawSort = archiveParams?.sort;
  const sortOption: SortOption = isValidSortOption(rawSort) ? rawSort : 'latest';
  const posts = await getPosts(sortOption); // 정렬 기준에 따라 게시글 불러오기

  return (
    <main className="container mx-auto px-4 py-6">
      {/* 제목 */}
      <section className="text-center py-6">
        <h1 className="text-3xl font-bold text-gray-800">🔥 최신 유머 모음</h1>
        <p className="text-gray-600 mt-2">최근 업로드된 유머를 확인해 보세요.</p>
      </section>

      {/* 정렬 옵션 */}
      <div className="flex justify-end mb-4">
        <SelectSorter current={sortOption} />
      </div>

      {/* 유머 리스트 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {posts.map((post: any) => (
          <div key={post._id} className="bg-white rounded-lg shadow-md p-4">
            <Image
              src={`/humor-${post.imageId ?? "default"}.jpg`}
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
      </section>

      {/* 페이지네이션 */}
      <div className="flex justify-center mt-8">
        <button className="bg-gray-300 px-4 py-2 rounded-l">◀ 이전</button>
        <span className="px-4 py-2 bg-gray-100">1 / 10</span>
        <button className="bg-gray-300 px-4 py-2 rounded-r">다음 ▶</button>
      </div>

      {/* 유머 업로드 버튼 */}
      {/* <div className="text-center mt-10">
        <Link href="/upload" className="bg-blue-500 text-white px-6 py-3 rounded-lg shadow-md hover:bg-blue-600 transition">
          ✨ 유머 업로드하기
        </Link>
      </div> */}
    </main>
  );
}
