import Link from "next/link";
import Image from "next/image";
import { SortOption, isValidSortOption } from "@/lib/sort";
import SelectSorter from "@/components/select-sorter";
import { myPosts } from "@/lib/posts";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { GetPostType } from "@/types/posts.d";
import { FaImage } from "react-icons/fa";
import { Props } from "@/types/my-uploads.d";

export default async function MyUploadsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);

  const params = await searchParams;
  const rawSort = params.sort as string | undefined; // 쿼리 파라미터에서 sort 값 가져오기
  console.log("rawSort", rawSort);

  const sortOption: SortOption = isValidSortOption(rawSort) ? rawSort : 'latest';
  const page = parseInt(params.page as string) || 1; // 쿼리 파라미터에서 page 값 가져오기
  const pageSize = parseInt(params.pageSize as string) || 12; // 페이지당 게시글 수

  const { total, posts } = await myPosts(session?.user.email, sortOption, page, pageSize, false); // 정렬 기준에 따라 게시글 불러오기

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
          posts.map((post: GetPostType) => (
            <div key={post._id} className="bg-white rounded-lg shadow-md inset-shadow-xs p-4">
              <div className="flex flex-col items-center justify-center h-[200px] max-h-[200px] overflow-hidden text-gray-400">
                {post.urls?.[0]?.thumbnailUrl ? (
                  <Image
                    src={post.urls[0].thumbnailUrl}
                    alt={post.title}
                    width={300}             // 고정 or 동적으로 조절 가능
                    height={200}            // 고정 or 동적으로 조절 가능
                    priority
                    className="rounded-md object-contain w-full h-auto"
                  />
                ) : (
                  <>
                    <FaImage size={128} />
                    <div className="text-sm mt-2">이미지가 없습니다</div>
                  </>
                )}
              </div>
              <h4 className="mt-3 text-lg font-semibold">{post.title}</h4>
              <p className="text-gray-500 text-sm">조회수 {post.views} • 댓글 {post.comments?.length || '0'}</p>
              <Link href={`/upload/${post._id}`} className="text-blue-500 mt-2 block me-2">수정 →</Link>
            </div>
          ))
        ) : (
          <p className="text-gray-500">아직 업로드한 유머가 없습니다.</p>
        )}
      </section>

      <div className="flex justify-center mt-8">
        <Link className="bg-gray-300 px-4 py-2 rounded-l cursor-pointer" href={{
          pathname: page > 0 ? "/my-uploads" : "#",
          query: {...params, page: page > 1 ? page - 1 : page}
        }}>◀ 이전</Link>
        <span className="px-4 py-2 bg-gray-100">{page} / {endPage}</span>
        <Link className="bg-gray-300 px-4 py-2 rounded-l cursor-pointer" href={{
          pathname: page < endPage ? "/my-uploads" : "#",
          query: {...params, page: endPage > page ? page + 1 : page}
        }}>다음 ▶</Link>
      </div>
    </main>
  );
}
