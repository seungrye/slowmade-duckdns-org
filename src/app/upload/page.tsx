
"use client";

import React, { useEffect, useRef, useState } from 'react';
import '@/app/upload/page.css';
import { Toaster, toast } from "react-hot-toast"; // ✅ 토스트 추가
import { UploadEditor, UploadEditorHandle } from '@/components/upload-editor';
import { useSession } from 'next-auth/react';

export default function UploadPage() {
    const { data: session } = useSession();
    
    const editorRef = useRef<UploadEditorHandle>(null);
    const [content, setContent] = useState('');
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (content && editorRef.current) {
            editorRef.current.setContent(content);
        }
    }, [content]);

    const handleSubmit = async () => {
        // 에디터에서 값 가져오기
        const {content, urls} = editorRef.current?.getContent() || { content: null, urls: [] };
        if (!title.trim() || !content) {
            return toast.error("제목과 내용을 입력해주세요.");
        } else {
            setLoading(true);
        }

        console.assert(session?.user, "session.user should not be null");

        const postData = {
            title,
            content: content,
            author: session?.user.name,
            userEmail: session?.user.email,
            urls: urls || [], // 에디터에서 가져온 이미지 URL 배열
        };

        try {
            const response = await fetch("/api/submit", {
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
        <div className="border border-gray-300 has-focus:shadow-sm rounded-b-lg max-h-[600px] h-[600px] upload-editor-wrapper">
            <UploadEditor ref={editorRef} />
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
