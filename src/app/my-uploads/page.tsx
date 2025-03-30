'use client'

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

const humorList = [
  { id: 1, title: "이거 실화냐? 😂", views: 1200, comments: 32, date: "2024-03-25", image: "/humor-1.jpg" },
  { id: 2, title: "이 밈 진짜 터진다! 🤣", views: 950, comments: 20, date: "2024-03-20", image: "/humor-2.jpg" },
  { id: 3, title: "웃다가 배 찢어질 뻔! 😆", views: 1400, comments: 45, date: "2024-03-18", image: "/humor-3.jpg" },
  { id: 4, title: "이 장면 너무 웃겨요! 😂", views: 800, comments: 12, date: "2024-03-15", image: "/humor-4.jpg" },
  { id: 5, title: "이게 무슨 상황이야? 🤯", views: 1100, comments: 28, date: "2024-03-10", image: "/humor-5.jpg" },
  { id: 6, title: "웃음이 멈추질 않는다 🤣", views: 1350, comments: 39, date: "2024-03-05", image: "/humor-6.jpg" },
  { id: 7, title: "이런 경우 처음 봄! 😲", views: 1000, comments: 22, date: "2024-02-28", image: "/humor-7.jpg" },
];

export default function MyHumorPage() {
  const [sortBy, setSortBy] = useState("latest");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // 정렬 함수
  const sortedHumor = [...humorList].sort((a, b) => {
    if (sortBy === "latest") return new Date(b.date).getTime() - new Date(a.date).getTime();
    if (sortBy === "popular") return b.views - a.views;
    return 0;
  });

  // 페이지네이션 계산
  const totalPages = Math.ceil(sortedHumor.length / itemsPerPage);
  const currentItems = sortedHumor.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <main className="container mx-auto px-4 py-6">
      {/* 제목 & 정렬 옵션 */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">📂 내가 올린 유머</h1>
        <select
          className="border rounded-lg px-3 py-2"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="latest">최신순</option>
          <option value="popular">인기순</option>
        </select>
      </div>

      {/* 유머 목록 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mt-6">
        {currentItems.length > 0 ? (
          currentItems.map((humor) => (
            <div key={humor.id} className="bg-white rounded-lg shadow-md p-4">
              <Image src={humor.image} alt={humor.title} width={300} height={200} className="rounded-md" />
              <h3 className="mt-3 text-lg font-semibold">{humor.title}</h3>
              <p className="text-gray-500 text-sm">조회수 {humor.views} • 댓글 {humor.comments} • {humor.date}</p>
              <div className="flex justify-between mt-3">
                <Link href={`/humor/${humor.id}`} className="text-blue-500">🔍 보기</Link>
                <button className="text-yellow-500">✏️ 수정</button>
                <button className="text-red-500">🗑 삭제</button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-gray-500">아직 업로드한 유머가 없습니다.</p>
        )}
      </div>

      {/* 페이지네이션 */}
      <div className="flex justify-center items-center mt-6 gap-4">
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
      </div>
    </main>
  );
}
