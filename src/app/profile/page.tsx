'use client'

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

const user = {
  name: "김유머",
  email: "humor@example.com",
  joined: "2024-01-01",
  profileImage: "/profile.jpg",
};

const myHumorList = [
  { id: 1, title: "이거 실화냐? 😂", views: 1200, comments: 32, image: "/humor-1.jpg" },
  { id: 2, title: "이 밈 진짜 터진다! 🤣", views: 950, comments: 20, image: "/humor-2.jpg" },
];

const savedHumorList = [
  { id: 3, title: "웃다가 배 찢어질 뻔! 😆", views: 1400, comments: 45, image: "/humor-3.jpg" },
];

export default function ProfilePage() {
  return (
    <main className="container mx-auto px-4 py-6">
      {/* 프로필 정보 */}
      <section className="bg-white shadow-md rounded-lg p-6 flex items-center gap-6">
        <Image src={user.profileImage} alt="프로필 이미지" width={80} height={80} className="rounded-full" />
        <div>
          <h2 className="text-2xl font-bold">{user.name}</h2>
          <p className="text-gray-600">{user.email}</p>
          <p className="text-gray-500 text-sm">가입일: {user.joined}</p>
        </div>
        <button className="ml-auto bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition">
          프로필 수정
        </button>
      </section>

      {/* 내가 올린 유머 */}
      <section className="mt-8">
        <h3 className="text-xl font-semibold">📌 내가 올린 유머</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mt-4">
          {myHumorList.length > 0 ? (
            myHumorList.map((humor) => (
              <div key={humor.id} className="bg-white rounded-lg shadow-md p-4">
                <Image src={humor.image} alt={humor.title} width={300} height={200} className="rounded-md" />
                <h4 className="mt-3 text-lg font-semibold">{humor.title}</h4>
                <p className="text-gray-500 text-sm">조회수 {humor.views} • 댓글 {humor.comments}</p>
                <Link href={`/humor/${humor.id}`} className="text-blue-500 mt-2 block">더 보기 →</Link>
              </div>
            ))
          ) : (
            <p className="text-gray-500">아직 업로드한 유머가 없습니다.</p>
          )}
        </div>
      </section>

      {/* 저장한 유머 */}
      {/* <section className="mt-8">
        <h3 className="text-xl font-semibold">🔖 저장한 유머</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mt-4">
          {savedHumorList.length > 0 ? (
            savedHumorList.map((humor) => (
              <div key={humor.id} className="bg-white rounded-lg shadow-md p-4">
                <Image src={humor.image} alt={humor.title} width={300} height={200} className="rounded-md" />
                <h4 className="mt-3 text-lg font-semibold">{humor.title}</h4>
                <p className="text-gray-500 text-sm">조회수 {humor.views} • 댓글 {humor.comments}</p>
                <Link href={`/humor/${humor.id}`} className="text-blue-500 mt-2 block">더 보기 →</Link>
              </div>
            ))
          ) : (
            <p className="text-gray-500">저장한 유머가 없습니다.</p>
          )}
        </div>
      </section> */}
    </main>
  );
}
