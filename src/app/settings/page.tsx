'use client';

import { useState } from "react";

export default function SettingsPage() {
  const [nickname, setNickname] = useState("유머왕");
  const [email, setEmail] = useState("humor@domain.com");
  const [darkMode, setDarkMode] = useState(false);
  const [password, setPassword] = useState("");

  const handleDarkModeToggle = () => setDarkMode((prev) => !prev);
  const handleSaveChanges = () => {
    // 실제로 서버에 변경 사항을 저장하는 로직을 추가해야 합니다.
    alert("변경 사항이 저장되었습니다.");
  };

  return (
    <main className={`container mx-auto px-4 py-6 ${darkMode ? "bg-gray-800 text-white" : "bg-white text-black"}`}>
      <h1 className="text-2xl font-bold mb-6">⚙️ 설정</h1>

      {/* 프로필 설정 */}
      <section className="mb-6">
        <h2 className="text-xl font-semibold">👤 프로필 설정</h2>
        <div className="mt-4">
          <label className="block">닉네임</label>
          <input
            type="text"
            className="border rounded-lg px-3 py-2 mt-1 w-full"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>
        <div className="mt-4">
          <label className="block">이메일</label>
          <input
            type="email"
            className="border rounded-lg px-3 py-2 mt-1 w-full"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </section>

      {/* 알림 설정 */}
      <section className="mb-6">
        <h2 className="text-xl font-semibold">🔔 알림 설정</h2>
        <div className="mt-4">
          <label className="flex items-center">
            <input type="checkbox" className="mr-2" />
            댓글 알림 받기
          </label>
        </div>
        <div className="mt-4">
          <label className="flex items-center">
            <input type="checkbox" className="mr-2" />
            새로운 유머 알림 받기
          </label>
        </div>
      </section>

      {/* 테마 설정 */}
      <section className="mb-6">
        <h2 className="text-xl font-semibold">🌙 테마 설정</h2>
        <div className="mt-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              className="mr-2"
              checked={darkMode}
              onChange={handleDarkModeToggle}
            />
            다크 모드
          </label>
        </div>
      </section>

      {/* 비밀번호 변경 */}
      <section className="mb-6">
        <h2 className="text-xl font-semibold">🔑 비밀번호 변경</h2>
        <div className="mt-4">
          <label className="block">현재 비밀번호</label>
          <input
            type="password"
            className="border rounded-lg px-3 py-2 mt-1 w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="mt-4">
          <label className="block">새로운 비밀번호</label>
          <input
            type="password"
            className="border rounded-lg px-3 py-2 mt-1 w-full"
          />
        </div>
      </section>

      {/* 저장 버튼 */}
      <div className="flex justify-end mt-6">
        <button
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          onClick={handleSaveChanges}
        >
          변경 사항 저장
        </button>
      </div>

      {/* 로그아웃 버튼 */}
      {/* <div className="flex justify-end mt-4">
        <Link href="/logout" className="text-red-500">
          로그아웃
        </Link>
      </div> */}
    </main>
  );
}
