import Link from "next/link";
import { SortOption, isValidSortOption } from "@/lib/sort";
import SelectSorter from "@/components/select-sorter";
import { myPosts } from "@/lib/posts";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import MyPostCard from "@/components/my-post-card";
import { Props } from "@/types/my-uploads.d";

export default async function MyUploadsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);

  const params = await searchParams;
  const rawSort = params.sort as string | undefined; // 쿼리 파라미터에서 sort 값 가져오기
  // console.log("rawSort", rawSort);

  const sortOption: SortOption = isValidSortOption(rawSort) ? rawSort : 'latest';
  const page = parseInt(params.page as string) || 1; // 쿼리 파라미터에서 page 값 가져오기
  const pageSize = parseInt(params.pageSize as string) || 12; // 페이지당 게시글 수

  const { total, posts } = await myPosts(session?.user.email, sortOption, page, pageSize, true); // 정렬 기준에 따라 게시글 불러오기

  const endPage = Math.ceil(total / pageSize); // 전체 페이지 수 계산

  return (
    <main className="container mx-auto px-4 py-6">
      {/* 제목 & 정렬 옵션 */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">📂 내가 올린 유머</h1>
        <SelectSorter current={sortOption}/>
      </div>

      {/* 유머 리스트 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mt-6">
        {posts.length > 0 ? (
          posts.map((post) => (
            <MyPostCard key={post._id} post={post} />
          ))
        ) : (
          <p className="text-gray-500">아직 업로드한 유머가 없습니다.</p>
        )}
      </section>

      <div className="flex justify-center mt-8">
        <Link className="bg-gray-300 px-4 py-2 rounded-l cursor-pointer" href={{
          pathname: page > 0 ? "/dashboard/posts" : "#",
          query: {...params, page: page > 1 ? page - 1 : page}
        }}>◀ 이전</Link>
        <span className="px-4 py-2 bg-gray-100">{page} / {endPage}</span>
        <Link className="bg-gray-300 px-4 py-2 rounded-l cursor-pointer" href={{
          pathname: page < endPage ? "/dashboard/posts" : "#",
          query: {...params, page: endPage > page ? page + 1 : page}
        }}>다음 ▶</Link>
      </div>
    </main>
  );
}
