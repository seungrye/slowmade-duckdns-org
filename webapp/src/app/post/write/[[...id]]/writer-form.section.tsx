"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from "react-hot-toast";
import { RichWebEditor, RichWebEditorHandle } from '@/components/rich-web-editor/editor';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { SetPostType } from '@/types/api/submit.d';
import { draftKey, isEmptyDraft, parseDraft, serializeDraft, type PostDraft } from '@/lib/post-draft';

/** localStorage can be blocked wholesale (private mode and so on) - a failed read must not block writing. */
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
    const [tags, setTags] = useState<string[]>([]); // The state for tag entry
    const [isPrivate, setIsPrivate] = useState(false); // Private (readable by the author alone). Public by default. Toggled by the padlock next to the title.
    const [attachments, setAttachments] = useState<AttachmentMeta[]>([]); // A dedicated attachment area below the body (like tags). The toolbar's clip adds a chip.
    const [pending, setPending] = useState<{ tempId: string; name: string; size: number; mimeType: string; progress: number }[]>([]); // Attachments still uploading (progress chips).
    const [loading, setLoading] = useState(false);
    const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined);
    const isMobile = useMobile();

    // Desktop only: the editor (the title, body, tags and submit together) is pinned to the viewport and the body scrolls
    // internally (editor.scss). Mobile's floating toolbar assumes the page scrolls, so it is not pinned and
    // the page is left to grow as before (no internal scrolling).
    // -- draft autosave (#199)
    //
    // Leaving the page or refreshing mid-write used to lose everything. It is kept in the browser and restored.
    //
    // **The body is stored only "at the moment of leaving".** `getContent()` touches the editor in markdown mode
    // (an internal setContent), so it cannot be called continuously while typing. Ordinary state such as the title
    // and tags is stored on every change (debounced).
    const storageKey = draftKey(typeof _id === 'string' ? _id : undefined);
    const [restoredAt, setRestoredAt] = useState<number | null>(null);
    // For an edit the draft is laid over **after** the server load - the draft is the more recent work.
    const [serverLoaded, setServerLoaded] = useState(!_id);
    const restoredRef = useRef(false);
    // The trigger that refetches when 'revert to the saved version' is pressed on an edit.
    const [reloadToken, setReloadToken] = useState(0);

    // Once the submit succeeds nothing more is stored (#257).
    //
    // Deleting alone is not enough - the cleanup hook below stores the draft **when leaving the screen**, so even after deleting,
    // navigating home records what was just submitted again. That is what happened: after a normal submit,
    // entering the writer brought the published post back as "what you were writing".
    const submittedRef = useRef(false);

    const saveDraft = useCallback(() => {
        if (submittedRef.current) return;
        // **The body is left alone while the editor is absent** (#201).
        // With `immediatelyRender: false` the inner editor is absent on the first render, and `getContent()` then
        // returns empty. Storing that overwrites a perfectly saved body with `null` and **the body alone disappears
        // from the draft** - a loss with no way back.
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
            // Storing an empty state would later show only "restored" with no content - so it is deleted.
            if (isEmptyDraft(draft)) return localStorage.removeItem(storageKey);
            const raw = serializeDraft(draft);
            if (!raw) return console.warn('임시 저장본이 너무 커서 건너뜁니다.');
            localStorage.setItem(storageKey, raw);
        } catch (err) {
            // A failed save must not block writing (a quota overrun, private mode and so on).
            console.warn('임시 저장에 실패했습니다.', err);
        }
    }, [storageKey, title, tags, isPrivate, attachments]);

    // The listener is attached once - the latest function is passed through a ref.
    const saveRef = useRef(saveDraft);
    useEffect(() => { saveRef.current = saveDraft; }, [saveDraft]);

    // A changed ordinary field is stored a moment later.
    useEffect(() => {
        if (!restoredRef.current) return; // Nothing is overwritten with an empty value before the restore
        const t = setTimeout(() => saveRef.current(), 1200);
        return () => clearTimeout(t);
    }, [title, tags, isPrivate, attachments]);

    // The moment of leaving - a refresh or tab close (pagehide), the tab hiding, and leaving the screen (unmount).
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

    // Restoring - immediately for a new post, and after the server post loads for an edit.
    useEffect(() => {
        if (!serverLoaded || restoredRef.current) return;
        restoredRef.current = true;
        let draft: PostDraft | null = null;
        try {
            draft = parseDraft(localStorage.getItem(storageKey), Date.now());
        } catch {
            return; // Writing must continue even when the store cannot be read
        }
        if (!draft) return;
        setTitle(draft.title);
        setTags(draft.tags);
        setIsPrivate(draft.isPrivate);
        setAttachments(draft.attachments as typeof attachments);
        setRestoredAt(draft.savedAt);

        // The body goes in **after the editor exists** (#201). With `immediatelyRender: false` the inner editor is absent
        // on the first render, and `setContent` is then silently ignored - the cause of the title coming back while the body
        // appeared to have vanished.
        const body = draft.jsonContent;
        if (!body) return;
        let tries = 0;
        const put = () => {
            if (editorRef.current?.isReady()) {
                editorRef.current.setContent(body as never, draft.uploadImageUrls as never);
                return;
            }
            if (tries++ < 60) setTimeout(put, 50); // 3 seconds at most - beyond that the editor has not come up
        };
        put();
    }, [serverLoaded, storageKey]);

    /**
     * Discards the draft.
     *
     * For a new post, clearing is all there is. **An edit must not be cleared** - it would look as though the
     * post saved on the server had gone too. So on an edit the saved version is fetched again (#201).
     */
    const discardDraft = () => {
        try { localStorage.removeItem(storageKey); } catch { /* 무시 */ }
        setRestoredAt(null);
        if (_id) {
            // Reverts to the server's saved version - it is also the way out of being stuck with a draft that keeps returning.
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
            // top includes the parent's py-6 top margin. The bottom py-6 (24px) is subtracted too, to prevent page scrolling.
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
                const { jsonContent, title, urls, tags: fetchedTags, isPrivate: fetchedPrivate, attachments: fetchedAttachments } = post; // Fetches the tags from the API.
                if (jsonContent) {
                    // Sets the content in the editor
                    console.assert(typeof jsonContent !== 'undefined', "jsonContent should not be undefined");
                    console.assert(typeof title === 'string', "jsonContent should be a string");
                    console.assert(Array.isArray(urls), "urls should be an array");
                    if (fetchedTags) {
                        // Tags can exist only in edit mode, so it is checked for being an array.
                        console.assert(Array.isArray(fetchedTags), "tags should be an array");
                    }
                    console.assert(editorRef.current, "editorRef.current should not be null");
                    editorRef.current?.setContent(jsonContent, urls);
                    setTitle(title);
                    setTags(fetchedTags || []);
                    setIsPrivate(!!fetchedPrivate);
                    // Existing attachments are restored as chips in the dedicated area (not inserted into the body).
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

        // Takes the values from the editor (the body and images). Attachments are separate state (the dedicated area).
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
            postData._id = _id as string; // The ID is added when editing
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
                // It is published, so the draft's job is done (#257). Storing stops first, then it is deleted -
                // the order matters. Deleting first lets the cleanup hook that follows write it again.
                submittedRef.current = true;
                try { localStorage.removeItem(storageKey); } catch { /* 무시 */ }
                toast.success(_id ? "게시글이 성공적으로 수정되었습니다!" : "게시글이 성공적으로 작성되었습니다!");

                showAchievementToasts(result.data);

                setTimeout(() => {
                    router.push("/");
                    router.refresh(); // Invalidates the Router Cache - so the just-written post appears at once in the home page's latest list
                }, 1000); // Goes home after a second
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
                    tabIndex={0} // Set so it can take focus through keyboard navigation
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
