"use client";

import { GetPostType } from "@/types/posts.d";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { FaImage } from "react-icons/fa";
import { useSession } from "next-auth/react";

const pageSize = 9; // 한 페이지에 보여줄 게시물 수

export default function MyHumorList() {
    const { data: session, status } = useSession();
    const [posts, setPosts] = useState<GetPostType[]>([]);
    const [page, setPage] = useState(1);
    const [endPage, setEndPage] = useState(0);

    const fetchPosts = useCallback(async (page: number) => {
        const res = await fetch(`/api/posts?page=${page}&limit=${pageSize}&email=${session?.user?.email || ''}`);
        const { data: { total, posts } } = await res.json();
        console.assert(posts.length > 0, "No posts found for the current page");

        setPosts(posts);
        setEndPage(Math.ceil(total / pageSize));
    }, [session?.user?.email]);

    useEffect(() => {
        fetchPosts(page);
    }, [fetchPosts, page]);

    if (status === "loading") { return <></>; }

    if (!session) { return <></>; }

    return <section className="mt-8">
        <h3 className="text-xl font-semibold">📌 내가 올린 유머</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mt-4">
            {posts.length > 0 ? (
                posts.map((post: GetPostType) => (
                    <div key={post._id} className="bg-white dark:bg-gray-900 rounded-lg shadow-md inset-shadow-xs p-4">
                        <div className="flex flex-col items-center justify-center h-[200px] max-h-[200px] overflow-hidden text-gray-400 dark:text-gray-500">
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
                        <p className="text-gray-500 dark:text-gray-400 text-sm">조회수 {post.views} • 댓글 {post.commentCount || '0'}</p>
                        <Link href={`/humor/${post._id}`} className="text-blue-500 mt-2 block">더 보기 →</Link>
                    </div>
                ))
            ) : (
                <p className="text-gray-500">아직 업로드한 유머가 없습니다.</p>
            )}
        </div>
        <div className="flex justify-center mt-8">
            <button className="bg-gray-300 dark:bg-gray-700 px-4 py-2 rounded-l cursor-pointer" disabled={page <= 1} onClick={() => page > 1 && setPage(page - 1)}
                aria-label="이전 페이지"
            >◀ 이전</button>
            <span className="px-4 py-2 bg-gray-100 dark:bg-gray-800">{page} / {endPage}</span>
            <button className="bg-gray-300 dark:bg-gray-700 px-4 py-2 rounded-r cursor-pointer" disabled={page >= endPage} onClick={() => endPage > page && setPage(page + 1)}
                aria-label="다음 페이지"
            >다음 ▶</button>
        </div>
    </section>;
}