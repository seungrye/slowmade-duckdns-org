"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from "react-hot-toast";
import { RichWebEditor, RichWebEditorHandle } from '@/components/rich-web-editor/editor';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { SetPostType } from '@/types/api/submit.d';
import { draftKey, isEmptyDraft, parseDraft, serializeDraft, type PostDraft } from '@/lib/post-draft';

/** localStorage 는 프라이빗 모드 등에서 통째로 막힐 수 있다 — 읽기 실패가 글쓰기를 막지 않게. */
function safeGet(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
}
import TagInput from '@/app/post/write/[[...id]]/tag-input.section';
import { showAchievementToasts } from '@/lib/show-achievement-toast';
import { useMobile } from '@/hooks/use-mobile';
import { lockIconSvg, type AttachmentMeta } from '@/components/rich-web-editor/attachment-icon';
import { AttachmentChip } from '@/components/attachment-chip';

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
    const [attachments, setAttachments] = useState<AttachmentMeta[]>([]); // 본문 하단 전용 첨부 영역(태그처럼). 툴바 클립 → 칩 추가.
    const [pending, setPending] = useState<{ tempId: string; name: string; size: number; mimeType: string; progress: number }[]>([]); // 업로드 진행 중 첨부(진행 칩).
    const [loading, setLoading] = useState(false);
    const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
    const isMobile = useMobile();

    // 데스크톱에서만: 에디터(제목·본문·태그·제출 전체)를 뷰포트에 고정하고 본문을 내부
    // 스크롤(editor.scss). 모바일은 플로팅 툴바가 페이지 스크롤을 전제하므로 고정하지 않고
    // 원래대로 페이지가 늘어나게 둔다(내부 스크롤 미적용).
    // ── 임시 저장 (#199)
    //
    // 글을 쓰다 페이지를 벗어나거나 새로고침하면 전부 사라졌다. 브라우저에 담아 뒀다 되살린다.
    //
    // **본문은 "떠나는 순간"에만 담는다.** `getContent()` 가 마크다운 모드에서 에디터를
    // 건드리므로(내부 setContent) 타이핑 중에 계속 부를 수는 없다. 제목·태그처럼 평범한
    // 상태는 바뀔 때마다(디바운스) 담는다.
    const storageKey = draftKey(typeof _id === 'string' ? _id : undefined);
    const [restoredAt, setRestoredAt] = useState<number | null>(null);
    // 수정 글은 서버에서 불러온 **뒤에** 초안을 얹는다 — 초안이 더 최근 작업이다.
    const [serverLoaded, setServerLoaded] = useState(!_id);
    const restoredRef = useRef(false);
    // 수정 글에서 '저장본으로 되돌리기' 를 누르면 다시 불러오게 하는 방아쇠.
    const [reloadToken, setReloadToken] = useState(0);

    const saveDraft = useCallback(() => {
        // **에디터가 아직 없으면 본문을 건드리지 않는다** (#201).
        // `immediatelyRender: false` 라 첫 렌더에는 내부 editor 가 없고, 그때 `getContent()` 는
        // 빈 값을 준다. 그대로 담으면 멀쩡히 저장돼 있던 본문을 `null` 로 덮어 **초안에서
        // 본문만 사라진다** — 되살릴 방법이 없는 손실이다.
        const ready = editorRef.current?.isReady() === true;
        const content = ready ? editorRef.current?.getContent() : undefined;
        let jsonContent = content?.jsonContent ?? null;
        let uploadImageUrls = content?.uploadImageUrls ?? [];
        if (!ready) {
            const kept = parseDraft(safeGet(storageKey), Date.now());
            jsonContent = kept?.jsonContent ?? null;
            uploadImageUrls = kept?.uploadImageUrls ?? [];
        }
        const draft: PostDraft = {
            title, tags, isPrivate, attachments,
            jsonContent,
            uploadImageUrls,
            savedAt: Date.now(),
        };
        try {
            // 빈 상태를 담아 두면 다음에 "복원했습니다" 만 뜨고 내용은 없다 — 지운다.
            if (isEmptyDraft(draft)) return localStorage.removeItem(storageKey);
            const raw = serializeDraft(draft);
            if (!raw) return console.warn('임시 저장본이 너무 커서 건너뜁니다.');
            localStorage.setItem(storageKey, raw);
        } catch (err) {
            // 저장 실패가 글쓰기를 막으면 안 된다(용량 초과·프라이빗 모드 등).
            console.warn('임시 저장에 실패했습니다.', err);
        }
    }, [storageKey, title, tags, isPrivate, attachments]);

    // 리스너는 한 번만 건다 — 최신 함수는 ref 로 넘긴다.
    const saveRef = useRef(saveDraft);
    useEffect(() => { saveRef.current = saveDraft; }, [saveDraft]);

    // 평범한 필드가 바뀌면 잠시 뒤 담는다.
    useEffect(() => {
        if (!restoredRef.current) return; // 복원 전에는 빈 값으로 덮지 않는다
        const t = setTimeout(() => saveRef.current(), 1200);
        return () => clearTimeout(t);
    }, [title, tags, isPrivate, attachments]);

    // 떠나는 순간 — 새로고침·탭 닫기(pagehide), 탭 숨김, 화면 이탈(언마운트).
    useEffect(() => {
        const onHide = () => saveRef.current();
        const onVisibility = () => { if (document.hidden) saveRef.current(); };
        window.addEventListener('pagehide', onHide);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('pagehide', onHide);
            document.removeEventListener('visibilitychange', onVisibility);
            if (restoredRef.current) saveRef.current();
        };
    }, []);

    // 복원 — 새 글은 바로, 수정 글은 서버 글을 불러온 뒤.
    useEffect(() => {
        if (!serverLoaded || restoredRef.current) return;
        restoredRef.current = true;
        let draft: PostDraft | null = null;
        try {
            draft = parseDraft(localStorage.getItem(storageKey), Date.now());
        } catch {
            return; // 저장소를 못 읽어도 글쓰기는 계속돼야 한다
        }
        if (!draft) return;
        setTitle(draft.title);
        setTags(draft.tags);
        setIsPrivate(draft.isPrivate);
        setAttachments(draft.attachments as typeof attachments);
        setRestoredAt(draft.savedAt);

        // 본문은 **에디터가 생긴 뒤에** 넣는다 (#201). `immediatelyRender: false` 라 첫 렌더에는
        // 내부 editor 가 없고, 그때 `setContent` 는 조용히 무시된다 — 제목만 되살아나고 본문은
        // 사라진 것처럼 보였던 원인이다.
        const body = draft.jsonContent;
        if (!body) return;
        let tries = 0;
        const put = () => {
            if (editorRef.current?.isReady()) {
                editorRef.current.setContent(body as never, draft.uploadImageUrls as never);
                return;
            }
            if (tries++ < 60) setTimeout(put, 50); // 최대 3초 — 그 이상이면 에디터가 안 뜬 것이다
        };
        put();
    }, [serverLoaded, storageKey]);

    /**
     * 초안을 버린다.
     *
     * 새 글이면 비우면 그만이다. **수정 글은 비우면 안 된다** — 서버에 저장된 글까지 날아간
     * 것처럼 보인다. 그래서 수정 글에서는 저장본을 다시 불러온다 (#201).
     */
    const discardDraft = () => {
        try { localStorage.removeItem(storageKey); } catch { /* 무시 */ }
        setRestoredAt(null);
        if (_id) {
            // 서버 저장본으로 되돌린다 — 초안이 계속 되살아나 갇히는 일도 이걸로 풀린다.
            setServerLoaded(false);
            restoredRef.current = false;
            setReloadToken((n) => n + 1);
            return;
        }
        setTitle('');
        setTags([]);
        setIsPrivate(false);
        setAttachments([]);
        editorRef.current?.setContent('' as never);
    };

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
                    editorRef.current?.setContent(jsonContent, urls);
                    setTitle(title);
                    setTags(fetchedTags || []);
                    setIsPrivate(!!fetchedPrivate);
                    // 기존 첨부는 전용 영역 칩으로 복원(본문 삽입 아님).
                    setAttachments(Array.isArray(fetchedAttachments) ? fetchedAttachments : []);
                } else {
                    toast.error("게시글을 불러오는 데 실패했습니다.");
                }
            } catch (error) {
                console.error("Error loading post:", error);
                toast.error("게시글을 불러오는 데 오류가 발생했습니다.");
            }
        };

        fetchPost(_id as string).finally(() => setServerLoaded(true));
    }, [_id, reloadToken]);

    const handleSubmit = async (e: React.FormEvent<HTMLButtonElement>) => {
        e.preventDefault();

        // 에디터에서 값 가져오기(본문·이미지). 첨부는 별도 state(전용 영역).
        const { htmlContent, jsonContent, uploadImageUrls: urls } = editorRef.current?.getContent() || { jsonContent: null, htmlContent: null, uploadImageUrls: [] };
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
            attachments, // 전용 첨부 영역 칩들의 메타(key 포함)
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
            {/* 임시 저장본을 되살렸을 때만 뜬다 (#199).
                자동 복원은 편하지만, 일부러 비우고 새로 쓰려던 경우엔 당황스럽다 — 한 번에
                되돌릴 수 있게 해 둔다. */}
            {restoredAt !== null && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                    <span>
                        작성 중이던 내용을 되살렸습니다
                        <span className="opacity-70">{` · ${new Date(restoredAt).toLocaleString('ko-KR')}`}</span>
                    </span>
                    <button
                        type="button"
                        onClick={discardDraft}
                        className="shrink-0 rounded border border-amber-300 px-2 py-0.5 hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/40"
                    >
                        {_id ? '저장본으로 되돌리기' : '새로 쓰기'}
                    </button>
                </div>
            )}
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
            {/* 바깥 박스: 테두리·라운드를 여기로. 에디터와 첨부행을 한 박스 안에 담아 보기 화면과 일관되게. */}
            <div className={`border border-gray-300 border-t-0 has-focus:shadow-sm rounded-b-lg flex flex-col ${isMobile ? "" : "flex-1 min-h-0"}`}>
                {/* 에디터 래퍼: 테두리 없이 .rich-web-editor-wrapper(내부 스크롤·overflow)만 유지 */}
                <div
                    className={`rich-web-editor-wrapper cursor-text ${isMobile ? "min-h-[480px]" : "flex-1 min-h-0"} ${attachments.length === 0 && pending.length === 0 ? "rounded-b-lg" : ""}`}
                    onClick={(e) => { if (e.target === e.currentTarget) editorRef.current?.focus() }}
                    onFocus={(e) => { if (e.target === e.currentTarget) editorRef.current?.focus() }}
                    tabIndex={0} // 키보드 네비게이션으로 포커스를 받을 수 있도록 설정
                    aria-label="Post content editor, click or press enter to start writing"
                >
                    <RichWebEditor
                        ref={editorRef}
                        onAttachStart={(p) => setPending((prev) => [...prev, { ...p, progress: 0 }])}
                        onAttachProgress={(tempId, percent) => setPending((prev) => prev.map((x) => x.tempId === tempId ? { ...x, progress: percent } : x))}
                        onAttachDone={(tempId, meta) => {
                            setPending((prev) => prev.filter((x) => x.tempId !== tempId));
                            setAttachments((prev) => [...prev, meta]);
                        }}
                        onAttachError={(tempId, name, message) => {
                            setPending((prev) => prev.filter((x) => x.tempId !== tempId));
                            toast.error(`${name}: ${message}`);
                        }}
                    />
                </div>
                {/* 첨부행: 박스 안 하단, border-t 구분선(뷰와 일관). 완료 칩 + 진행 칩. 둘 다 없으면 숨김. */}
                {(attachments.length > 0 || pending.length > 0) && (
                    <div className="shrink-0 border-t border-t-gray-200 dark:border-t-gray-700 p-3 flex flex-nowrap items-center gap-2 overflow-x-auto">
                        {attachments.map((att) => (
                            <AttachmentChip
                                key={att.id}
                                att={att}
                                onRemove={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                            />
                        ))}
                        {pending.map((p) => (
                            <AttachmentChip
                                key={p.tempId}
                                att={{ id: p.tempId, name: p.name, size: p.size, mimeType: p.mimeType }}
                                progress={p.progress}
                            />
                        ))}
                    </div>
                )}
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
                    className={`bg-blue-500 hover:bg-blue-600 text-white font-medium px-4 py-2 rounded-lg transition duration-200 ${(loading || pending.length > 0) && "opacity-50 cursor-not-allowed"}`}
                    disabled={loading || pending.length > 0}
                    aria-label="Submit"
                >
                    {loading ? "업로드 중..." : pending.length > 0 ? "첨부 업로드 중..." : "Submit"}
                </button>
            </div>
        </div>
    );
}
