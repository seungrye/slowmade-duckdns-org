
"use client";

import dynamic from 'next/dynamic';
import React, { useMemo, useState } from 'react';
import '@/app/upload/page.css';
import { Toaster, toast } from "react-hot-toast"; // ✅ 토스트 추가

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

export default function UploadPage() {
    const [content, setContent] = useState('');
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(false);

    const imageHandler = async () => {
        const input = document.createElement("input");
        input.setAttribute("type", "file");
        input.setAttribute("accept", "image/*");
        input.click();

        // 참고 : https://velog.io/@jungsangu/Next.js%EC%97%90%EC%84%9C-react-quill-%EC%9D%B4%EB%AF%B8%EC%A7%80-%EC%97%85%EB%A1%9C%EB%93%9C-%ED%95%98%EA%B8%B0
        input.addEventListener("change", async () => {
            ////이미지를 담아 전송할 formData를 만든다
            //const file = input.files?.[0];

            //   try {
            //     //업로드할 파일의 이름으로 Date 사용
            //     const name = Date.now();
            //     //s3 관련 설정들
            //     AWS.config.update({
            //       region: REGION,
            //       accessKeyId: ACCESS_KEY,
            //       secretAccessKey: SECRET_ACCESS_KEY,
            //     });
            //     //앞서 생성한
            //     const upload = new AWS.S3.ManagedUpload({
            //       params: {
            //         ACL: "public-read",
            //         Bucket: "itsmovietime",
            //         Key: `upload/${name}`,
            //         Body: file,
            //       },
            //     });
            //     //이미지 업로드
            //     //업로드 된 이미지 url을 가져오기
            //     const url_key = await upload.promise().then((res) => res.Key);
            //     //useRef를 사용해 에디터에 접근한 후
            //     //에디터의 현재 커서 위치에 이미지 삽입
            //     const editor = quillRef.current.getEditor();
            //     const range = editor.getSelection();
            //     // 가져온 위치에 이미지를 삽입한다
            //     editor.insertEmbed(range.index, "image", CLOUD_FRONT_URL + url_key);
            //   } catch (error) {
            //     console.log(error);
            //   }
        });
    };

    // useMemo를 사용한 이유는 modules가 렌더링마다 변하면 에디터에서 입력이 끊기는 버그가 발생
    const modules = useMemo(() => ({
        toolbar: {
            container: [
                [{ header: "1" }, { header: "2" }, { header: "3" }, { font: [] }],
                [{ size: [] }],
                ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }, { 'indent': '-1' }, { 'indent': '+1' }],
                ['link', 'image', 'video'],
                ["code-block"],
                ['clean']
            ],
            clipboard: {
                matchVisual: false,
            },
            handlers: { image: imageHandler }
        }
    }), []);


    const formats = [
        "header",
        "font",
        "size",
        "bold",
        "italic",
        "underline",
        "strike",
        "blockquote",
        "list",
        "bullet",
        "indent",
        "link",
        "image",
        "video",
        "code-block",
    ];

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
        <div className="border border-gray-300 has-focus:shadow-sm rounded-b-lg">
            <ReactQuill
                theme='snow'
                modules={modules}
                formats={formats}
                value={content}
                onChange={setContent}
                className=""
            />
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
