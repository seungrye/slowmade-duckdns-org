"use client";

import React, { useEffect, useRef, useState } from 'react';
import { toast } from "react-hot-toast";
import { RichWebEditor, RichWebEditorHandle } from '@/components/rich-web-editor/editor';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { SetPostType } from '@/types/api/submit.d';
import TagInput from '@/app/post/write/[[...id]]/tag-input.section';
import { showAchievementToasts } from '@/lib/show-achievement-toast';
import { useMobile } from '@/hooks/use-mobile';
import { lockIconSvg } from '@/components/rich-web-editor/attachment-icon';

export default function PostWriterForm() {
    const { data: session } = useSession();
    const router = useRouter();
    const { id } = useParams(); // id: string | string[] | undefined
    const _id = Array.isArray(id) ? id[0] : id;

    const editorRef = useRef<RichWebEditorHandle>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [title, setTitle] = useState('');
    const [tags, setTags] = useState<string[]>([]); // 태그 입력을 위한 상태
    const [isPrivate, setIsPrivate] = useState(false); // 비공개(작성자만 열람). 기본 공개. 제목 옆 자물쇠로 토글.
    const [loading, setLoading] = useState(false);
    const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
    const isMobile = useMobile();

    // 데스크톱에서만: 에디터(제목·본문·태그·제출 전체)를 뷰포트에 고정하고 본문을 내부
    // 스크롤(editor.scss). 모바일은 플로팅 툴바가 페이지 스크롤을 전제하므로 고정하지 않고
    // 원래대로 페이지가 늘어나게 둔다(내부 스크롤 미적용).
    useEffect(() => {
        if (isMobile) {
            setMaxHeight(undefined);
            return;
        }
        const update = () => {
            const el = containerRef.current;
            if (!el) return;
            const top = el.getBoundingClientRect().top;
            // top 은 부모 py-6 상단여백 포함. 하단 py-6(24px) 여백도 빼 페이지 스크롤 방지.
            setMaxHeight(Math.max(320, window.innerHeight - top - 24));
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [isMobile]);

    useEffect(() => {
        console.log("PostWriterForm mounted with _id:", _id);
        if (!_id) return;
        if (!editorRef.current) return;

        console.assert(typeof _id === 'string', "_id should be a string");

        const fetchPost = async (_id: string) => {
            try {
                const res = await fetch(`/api/post?_id=${_id}`);
                if (!res.ok) {
                    throw new Error("Failed to fetch post");
                }

                const { data: post } = await res.json();
                const { jsonContent, title, urls, tags: fetchedTags, isPrivate: fetchedPrivate, attachments: fetchedAttachments } = post; // API로부터 태그를 받아옵니다.
                if (jsonContent) {
                    // 에디터에 내용 설정
                    console.assert(typeof jsonContent !== 'undefined', "jsonContent should not be undefined");
                    console.assert(typeof title === 'string', "jsonContent should be a string");
                    console.assert(Array.isArray(urls), "urls should be an array");
                    if (fetchedTags) {
                        // 수정 모드일 때만 태그가 있을 수 있으므로, 배열인지 확인합니다.
                        console.assert(Array.isArray(fetchedTags), "tags should be an array");
                    }
                    console.assert(editorRef.current, "editorRef.current should not be null");
                    // 기존 첨부 메타(key 포함)를 에디터 ref 에 시드 → 수정 저장 시 보존(본문 칩은 jsonContent 로 이미 복원).
                    editorRef.current?.setContent(jsonContent, urls, Array.isArray(fetchedAttachments) ? fetchedAttachments : []);
                    setTitle(title);
                    setTags(fetchedTags || []);
                    setIsPrivate(!!fetchedPrivate);
                } else {
                    toast.error("게시글을 불러오는 데 실패했습니다.");
                }
            } catch (error) {
                console.error("Error loading post:", error);
                toast.error("게시글을 불러오는 데 오류가 발생했습니다.");
            }
        };

        fetchPost(_id as string);
    }, [_id]);

    const handleSubmit = async (e: React.FormEvent<HTMLButtonElement>) => {
        e.preventDefault();

        // 에디터에서 값 가져오기(본문·이미지·첨부 메타 일괄)
        const { htmlContent, jsonContent, uploadImageUrls: urls, uploadAttachments } = editorRef.current?.getContent() || { jsonContent: null, htmlContent: null, uploadImageUrls: [], uploadAttachments: [] };
        if (!title.trim() || !jsonContent) {
            return toast.error("제목과 내용을 입력해주세요.");
        } else {
            setLoading(true);
        }

        console.assert(session?.user, "session.user should not be null");

        const postData: Partial<SetPostType> = {
            title,
            htmlContent: htmlContent!, // HTMLContent는 null일 수 있지만, 여기서는 반드시 있어야 합니다.
            jsonContent: jsonContent!, // JSONContent는 null일 수 있지만, 여기서는 반드시 있어야 합니다.
            author: session?.user.name,
            userEmail: session?.user.email,
            urls: urls || [], // 에디터에서 가져온 이미지 URL 배열
            tags: tags, // 태그 상태는 이미 문자열 배열입니다.
            isPrivate,
            attachments: uploadAttachments || [], // 본문 인라인 첨부 칩들의 메타(key 포함)
        };

        if (_id) {
            postData._id = _id as string; // 수정하는 경우 ID 추가
            console.log("게시글 수정 데이터:", postData);
        }

        try {
            const response = await fetch("/api/submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(postData),
            });

            if (response.ok) {
                const result = await response.json();
                toast.success(_id ? "게시글이 성공적으로 수정되었습니다!" : "게시글이 성공적으로 작성되었습니다!");

                showAchievementToasts(result.data);

                setTimeout(() => {
                    router.push("/");
                    router.refresh(); // Router Cache 무효화 — 방금 작성한 글이 홈 최신 목록에 즉시 반영되도록
                }, 1000); // 1초 후 홈으로 이동
            } else {
                toast.error("업로드에 실패했습니다.");
                setLoading(false);
            }
        } catch (error) {
            console.error("Error:", error);
            toast.error("서버 오류가 발생했습니다.");
            setLoading(false);
        }
    };

    return (
        <div
            ref={containerRef}
            style={!isMobile && maxHeight ? { height: `${maxHeight}px` } : undefined}
            className={!isMobile ? "flex flex-col" : undefined}
        >
            <div className="border border-gray-300 rounded-b-none rounded-lg has-focus:shadow-sm shrink-0 flex items-center">
                <input
                    type="text"
                    placeholder="제목을 입력하세요"
                    defaultValue={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className='flex-1 p-3 bg-transparent outline-none'
                />
                {/* 공개/비공개 토글 — 열린 자물쇠=공개 / 닫힌(주황)=비공개(작성자만) */}
                <button
                    type="button"
                    onClick={() => setIsPrivate((v) => !v)}
                    title={isPrivate ? '비공개 (나만 보기) — 클릭하면 공개로' : '공개 — 클릭하면 비공개(나만 보기)로'}
                    aria-label={isPrivate ? '비공개' : '공개'}
                    aria-pressed={isPrivate}
                    className={`mr-2 p-1.5 rounded-md transition-colors ${isPrivate ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                    dangerouslySetInnerHTML={{ __html: lockIconSvg(isPrivate) }}
                />
            </div>
            <div
                className={`border border-gray-300 border-t-0 has-focus:shadow-sm rounded-b-lg rich-web-editor-wrapper cursor-text ${isMobile ? "min-h-[480px]" : "flex-1 min-h-0"}`}
                onClick={(e) => { if (e.target === e.currentTarget) editorRef.current?.focus() }}
                onFocus={(e) => { if (e.target === e.currentTarget) editorRef.current?.focus() }}
                tabIndex={0} // 키보드 네비게이션으로 포커스를 받을 수 있도록 설정
                aria-label="Post content editor, click or press enter to start writing"
            >
                <RichWebEditor ref={editorRef} />
            </div>
            <div className="mt-4 shrink-0">
                <TagInput
                    tags={tags}
                    onTagsChange={setTags}
                    placeholder="태그를 입력하고 Enter 또는 쉼표를 누르세요"
                />
            </div>

            <div className="flex justify-end mt-4 shrink-0">
                <button
                    onClick={handleSubmit}
                    className={`bg-blue-500 hover:bg-blue-600 text-white font-medium px-4 py-2 rounded-lg transition duration-200 ${loading && "opacity-50 cursor-not-allowed"}`}
                    disabled={loading}
                    aria-label="Submit"
                >
                    {loading ? "업로드 중..." : "Submit"}
                </button>
            </div>
        </div>
    );
}
