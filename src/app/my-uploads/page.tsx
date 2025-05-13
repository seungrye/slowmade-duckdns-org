import Link from "next/link";
import Image from "next/image";
import { SortOption, isValidSortOption } from "@/lib/sort";
import SelectSorter from "@/components/select-sorter";
import { formatNumber } from "@/lib/format";
import { myPosts } from "@/lib/posts";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

type MyUploadsPageProps = {
  myUploadParams: {
    sort?: string;
  };
};

export default async function MyUploadsPage({ myUploadParams }: MyUploadsPageProps) {
  const session = await getServerSession(authOptions);
  const rawSort = myUploadParams?.sort;
  const sortOption: SortOption = isValidSortOption(rawSort) ? rawSort : 'latest';
  const posts = await myPosts(session?.user.email, sortOption, false); // 정렬 기준에 따라 게시글 불러오기

  // const currentPage = 1;
  // const itemsPerPage = 6;

  // // 페이지네이션 계산
  // const totalPages = Math.ceil(posts.length / itemsPerPage);
  // const currentItems = posts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <main className="container mx-auto px-4 py-6">
      {/* 제목 & 정렬 옵션 */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">📂 내가 올린 유머</h1>
        <SelectSorter current={sortOption} />
      </div>

      {/* 유머 리스트 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mt-6">
        {posts.length > 0 ? (
          posts.map((post: any) => (
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
              <button className="text-yellow-500">✏️ 수정</button>
              <button className="text-red-500">🗑 삭제</button>
            </div>
          ))
        ) : (
          <p className="text-gray-500">아직 업로드한 유머가 없습니다.</p>
        )}
      </section>

      {/* 페이지네이션 */}
      {/* <div className="flex justify-center items-center mt-6 gap-4">
        <button
          className={`px-4 py-2 border rounded-lg ${currentPage === 1 ? "text-gray-400 cursor-not-allowed" : "hover:bg-gray-100"}`}
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
        >
          ◀ 이전
        </button>
        <span className="text-lg font-semibold">{currentPage} / {totalPages}</span>
        <button
          className={`px-4 py-2 border rounded-lg ${currentPage === totalPages ? "text-gray-400 cursor-not-allowed" : "hover:bg-gray-100"}`}
          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
          disabled={currentPage === totalPages}
        >
          다음 ▶
        </button>
      </div> */}
      <div className="flex justify-center mt-8">
        <button className="bg-gray-300 px-4 py-2 rounded-l">◀ 이전</button>
        <span className="px-4 py-2 bg-gray-100">1 / 10</span>
        <button className="bg-gray-300 px-4 py-2 rounded-r">다음 ▶</button>
      </div>

    </main>
  );
}
