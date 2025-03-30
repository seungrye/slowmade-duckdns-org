'use client'

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

const humorList = [
  { id: 1, title: "이거 실화냐? 😂", views: 1200, comments: 32, image: "/humor-1.jpg" },
  { id: 2, title: "이 밈 진짜 터진다! 🤣", views: 950, comments: 20, image: "/humor-2.jpg" },
  { id: 3, title: "웃다가 배 찢어질 뻔! 😆", views: 1400, comments: 45, image: "/humor-3.jpg" },
  { id: 4, title: "이 장면 너무 웃겨요! 😂", views: 800, comments: 12, image: "/humor-4.jpg" },
];

export default function RandomHumor() {
  const getRandomHumor = () => humorList[Math.floor(Math.random() * humorList.length)];
  const [randomHumor, setRandomHumor] = useState(getRandomHumor);

  return (
    <main className="container mx-auto px-4 py-6 text-center">
      {/* 제목 */}
      <h1 className="text-3xl font-bold text-gray-800">🎲 랜덤 유머</h1>
      <p className="text-gray-600 mt-2">운을 시험해 보세요! 어떤 유머가 나올까요?</p>

      {/* 유머 카드 */}
      <div className="bg-white rounded-lg shadow-md p-6 mt-6 mx-auto max-w-lg">
        <Image src={randomHumor.image} alt={randomHumor.title} width={400} height={250} className="rounded-md" />
        <h3 className="mt-4 text-xl font-semibold">{randomHumor.title}</h3>
        <p className="text-gray-500 text-sm">조회수 {randomHumor.views} • 댓글 {randomHumor.comments}</p>
        <Link href={`/humor/${randomHumor.id}`} className="text-blue-500 mt-2 block">더 보기 →</Link>
      </div>

      {/* 랜덤 다시 불러오기 버튼 */}
      {/* <button
        className="bg-blue-500 text-white px-6 py-3 rounded-lg shadow-md hover:bg-blue-600 transition mt-6"
        onClick={() => setRandomHumor(getRandomHumor)}
      >
        🔄 다른 유머 보기
      </button> */}
    </main>
  );
}
