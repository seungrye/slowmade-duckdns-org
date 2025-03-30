'use client'

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

const humorList = [
  { id: 1, title: "이거 실화냐? 😂", views: 1200, comments: 32, image: "/humor-1.jpg" },
  { id: 2, title: "이 밈 진짜 터진다! 🤣", views: 950, comments: 20, image: "/humor-2.jpg" },
  { id: 3, title: "웃다가 배 찢어질 뻔! 😆", views: 1400, comments: 45, image: "/humor-3.jpg" },
  { id: 4, title: "이 장면 너무 웃겨요! 😂", views: 800, comments: 12, image: "/humor-4.jpg" },
];

export default function LatestHumor() {
  const [sortOption, setSortOption] = useState("latest"); // 정렬 옵션 (latest, popular)

  return (
    <main className="container mx-auto px-4 py-6">
      {/* 제목 */}
      <section className="text-center py-6">
        <h1 className="text-3xl font-bold text-gray-800">🔥 최신 유머 모음</h1>
        <p className="text-gray-600 mt-2">최근 업로드된 유머를 확인해 보세요.</p>
      </section>

      {/* 정렬 옵션 */}
      <div className="flex justify-end mb-4">
        <select
          className="border border-gray-300 rounded px-3 py-2"
          value={sortOption}
          onChange={(e) => setSortOption(e.target.value)}
        >
          <option value="latest">최신순</option>
          <option value="popular">인기순</option>
          <option value="commented">댓글 많은 순</option>
        </select>
      </div>

      {/* 유머 리스트 */}
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {humorList.map((humor) => (
          <div key={humor.id} className="bg-white rounded-lg shadow-md p-4">
            <Image src={humor.image} alt={humor.title} width={300} height={200} className="rounded-md" />
            <h3 className="mt-3 text-lg font-semibold">{humor.title}</h3>
            <p className="text-gray-500 text-sm">조회수 {humor.views} • 댓글 {humor.comments}</p>
            <Link href={`/humor/${humor.id}`} className="text-blue-500 mt-2 block">더 보기 →</Link>
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
