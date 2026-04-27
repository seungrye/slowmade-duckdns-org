import Link from "next/link";
import { Toaster } from "react-hot-toast";
import { SortOption, isValidSortOption } from "@/lib/sort";
import SelectSorter from "@/components/select-sorter";
import { myPosts } from "@/lib/posts";
import { auth } from "@/auth";
import { GetPostType } from "@/types/posts.d";
import { Props } from "@/types/my-uploads.d";
import PostActions from "@/components/post-actions";
import PostContentPreview from "@/components/post-content-preview";
import Image from "next/image";
import { Suspense } from "react";
import Loading from "./loading";

export default async function MyUploadsPage({ searchParams }: Props) {
  const session = await auth();

  if (!session) {
    return <section className="bg-white shadow-md inset-shadow-xs rounded-lg p-6 flex items-center gap-6">
      <p className="text-center text-gray-500 dark:text-gray-400">로그인이 필요합니다.</p>
    </section>;
  }

  const params = await searchParams;
  const rawSort = params.sort as string | undefined; // 쿼리 파라미터에서 sort 값 가져오기
  // console.log("rawSort", rawSort);

  const sortOption: SortOption = isValidSortOption(rawSort) ? rawSort : 'latest';
  const page = parseInt(params.page as string) || 1; // 쿼리 파라미터에서 page 값 가져오기
  const pageSize = parseInt(params.pageSize as string) || 12; // 페이지당 게시글 수

  const { total, posts } = await myPosts(session?.user.email, sortOption, page, pageSize, true); // 정렬 기준에 따라 게시글 불러오기

  const endPage = Math.ceil(total / pageSize); // 전체 페이지 수 계산

  return (
    <main className="mx-auto px-4 py-6">
      <Toaster position="bottom-right" />

      {/* 제목 & 정렬 옵션 */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">📂 내가 올린 유머</h1>
        <SelectSorter current={sortOption} />
      </div>

      {/* 유머 리스트 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mt-6">
        {posts.length > 0 ? (
          posts.map((post: GetPostType) => (
            <div key={post._id} className="bg-white dark:bg-gray-900 rounded-lg shadow-md inset-shadow-xs p-4">
              <Suspense fallback={<Loading />}>
                <Link href={`/post/view/${post._id}`} className="" aria-label={`유머 보기: ${post.title}`}>
                  <div className="h-[200px] overflow-hidden">
                    {post.urls?.[0]?.thumbnailUrl ? (
                      <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
                        <Image
                          src={post.urls[0].thumbnailUrl}
                          alt={post.title}
                          width={300}
                          height={200}
                          priority
                          className="rounded-md object-contain w-full h-auto"
                        />
                      </div>
                    ) : (
                      <PostContentPreview content={post.jsonContent} />
                    )}
                  </div>
                  <h4 className="mt-3 text-lg font-semibold truncate">{post.title}</h4>
                </Link>
                <p className="text-gray-500 dark:text-gray-400 text-sm">조회수 {post.views} • 댓글 {post.commentCount || '0'}</p>
                <PostActions postId={post._id} authorEmail={post.userEmail} />
              </Suspense>
            </div>
          ))
        ) : (
          <p className="text-gray-500 dark:text-gray-400">아직 업로드한 유머가 없습니다.</p>
        )}
      </section>

      <div className="flex justify-center mt-8">
        <Link className="bg-gray-300 dark:bg-gray-700 px-4 py-2 rounded-l cursor-pointer" href={{
          pathname: page > 0 ? "/dashboard/posts" : "#",
          query: { ...params, page: page > 1 ? page - 1 : page }
        }}>◀ 이전</Link>
        <span className="px-4 py-2 bg-gray-100 dark:bg-gray-800">{page} / {endPage}</span>
        <Link className="bg-gray-300 dark:bg-gray-700 px-4 py-2 rounded-r cursor-pointer" href={{
          pathname: page < endPage ? "/dashboard/posts" : "#",
          query: { ...params, page: endPage > page ? page + 1 : page }
        }}>다음 ▶</Link>
      </div>
    </main>
  );
}
