
"use client";

import React, { useEffect, useRef, useState } from 'react';
import '@/app/post/write/[[...id]]/page.css';
import { Toaster, toast } from "react-hot-toast"; // ✅ 토스트 추가
import { RichWebEditor, RichWebEditorHandle } from '@/components/rich-web-editor/editor';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { PostDataParams } from '@/types/api/submit.d';
import { AchievementToast } from '@/components/achievement-toast';

export default function PostWriter() {
    const { data: session } = useSession();
    const router = useRouter();
    const params = useParams(); // 예: { id: '123' }

    const editorRef = useRef<RichWebEditorHandle>(null);
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!params.id) return;
        if (!editorRef.current) return;

        const fetchPost = async (_id: string) => {
            try {
                const res = await fetch(`/api/post?_id=${_id}`);
                if (!res.ok) {
                    throw new Error("Failed to fetch post");
                }

                const { jsonContent, title, urls } = await res.json();
                if (jsonContent) {
                    // 에디터에 내용 설정
                    console.assert(typeof jsonContent !== 'undefined', "jsonContent should not be undefined");
                    console.assert(typeof title === 'string', "jsonContent should be a string");
                    console.assert(Array.isArray(urls), "urls should be an array");
                    console.assert(typeof title === 'string', "title should be a string");
                    console.assert(editorRef.current, "editorRef.current should not be null");
                    editorRef.current?.setContent(jsonContent, urls);
                    setTitle(title);
                } else {
                    toast.error("게시글을 불러오는 데 실패했습니다.");
                }
            } catch (error) {
                console.error("Error loading post:", error);
                toast.error("게시글을 불러오는 데 오류가 발생했습니다.");
            }
        };

        fetchPost(params.id as string);
    }, [params.id]);

    const handleSubmit = async (e: React.FormEvent<HTMLButtonElement>) => {
        e.preventDefault();

        // 에디터에서 값 가져오기
        const { htmlContent, jsonContent, uploadImageUrls: urls } = editorRef.current?.getContent() || { jsonContent: null, htmlContent: null, urls: [] };
        if (!title.trim() || !jsonContent) {
            return toast.error("제목과 내용을 입력해주세요.");
        } else {
            setLoading(true);
        }

        console.assert(session?.user, "session.user should not be null");

        const postData: PostDataParams = {
            _id: null, // 새 게시글인 경우 ID는 null
            title,
            htmlContent: htmlContent,
            jsonContent: jsonContent,
            author: session?.user.name,
            userEmail: session?.user.email,
            urls: urls || [], // 에디터에서 가져온 이미지 URL 배열
        };

        if (params.id) {
            postData._id = params.id as string; // 수정하는 경우 ID 추가
        }

        try {
            const response = await fetch("/api/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(postData),
            });

            if (response.ok) {
                toast.success(params._id ? "게시글이 성공적으로 수정되었습니다!" : "게시글이 성공적으로 작성되었습니다!");

                router.replace("/"); // 홈으로 이동
                router.refresh(); // 페이지 새로고침
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

    return (<div className='mx-auto px-4 py-6'>
        <Toaster position="top-right" /> {/* ✅ 토스트 메시지 표시 위치 */}

        <div className="border border-gray-300 rounded-b-none rounded-lg mb-4 has-focus:shadow-sm">
            <input
                type="text"
                placeholder="제목을 입력하세요"
                defaultValue={title}
                onChange={(e) => setTitle(e.target.value)}
                className='w-full p-3'
            />
        </div>
        <div className="border border-gray-300 has-focus:shadow-sm rounded-b-lg max-h-[600px] h-5/6 rich-web-editor-wrapper">
            <RichWebEditor ref={editorRef} />
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
