import { UploadImageUrl } from "@/components/upload-editor";
import { HTMLContent, JSONContent } from "@tiptap/react";

export type PostDataParams = {
    _id: string | null, // 새 게시글인 경우 ID는 null
    title: string,
    htmlContent: HTMLContent | null | undefined, // HTMLContent는 null일 수 있음
    jsonContent: JSONContent | null | undefined, // JSONContent는 null일 수 있음
    author: string | null | undefined,
    userEmail: string | null | undefined,
    urls: UploadImageUrl[] | [], // 에디터에서 가져온 이미지 URL 배열
}