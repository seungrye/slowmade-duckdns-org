
"use client";

import React, { useMemo, useState } from 'react';
import '@/app/upload/page.css';
import { Toaster, toast } from "react-hot-toast"; // ✅ 토스트 추가
import { UploadEditor } from '../components/UploadEditor';

export default function UploadPage() {
    const [content, setContent] = useState('');
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!title.trim() || !content.trim()) {
            return toast.error("제목과 내용을 입력해주세요.");
        } else {
            setLoading(true);
        }

        const postData = {
            title,
            content,
            author: "익명", // 실제 프로젝트에서는 로그인된 사용자의 닉네임 사용
            userId: "661e7a1234567890abcd1234", // 실제 프로젝트에서는 로그인된 사용자 ID 사용
        };

        try {
            const response = await fetch("/api/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(postData),
            });

            if (response.ok) {
                toast.success("게시글이 성공적으로 업로드되었습니다!");
                setTitle("");
                setContent("");
            } else {
                toast.error("업로드에 실패했습니다.");
            }
        } catch (error) {
            console.error("Error:", error);
            toast.error("서버 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    return (<div className=''>
        <Toaster position="top-right" /> {/* ✅ 토스트 메시지 표시 위치 */}

        <div className="border border-gray-300 rounded-b-none rounded-lg mb-4 has-focus:shadow-sm">
            <input
                type="text"
                placeholder="제목을 입력하세요"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className='w-full p-3'
            />
        </div>
        <div className="border border-gray-300 has-focus:shadow-sm rounded-b-lg max-h-[600px] h-[600px]">
            <UploadEditor />
        </div>
        <div className="flex justify-end mt-4">
            <button
                onClick={handleSubmit}
                className={`bg-blue-500 hover:bg-blue-600 text-white font-medium px-4 py-2 rounded-lg transition duration-200 ${loading && "opacity-50 cursor-not-allowed"}`}
                disabled={loading}
            >
                {loading ? "업로드 중..." : "Submit"}
            </button>
        </div>
    </div>
    );
}
