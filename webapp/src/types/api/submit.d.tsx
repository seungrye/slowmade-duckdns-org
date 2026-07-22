import { ImageUrlType, PostType } from "@/models/post";

/**
 * PostType에서 일부 필드의 타입을 재정의(override)하고,
 * Mongoose의 InferSchemaType이 추론하지 못하는 _id 필드를 추가한 타입입니다.
 * Omit 유틸리티 타입을 사용하여 기존 타입을 명시적으로 제외하고 새 타입으로 덮어씁니다.
 */
export type SetPostType = Omit<PostType, 'author' | 'userEmail' | 'urls' | 'attachments' | 'likes' | 'dislikes' | 'views' | 'createdAt' | 'updatedAt'> & {
    _id: string | null; // Mongoose Document의 _id는 ObjectId이지만, 클라이언트에서는 string으로 다루거나, 새 글일 경우 null입니다.
    author: string | null | undefined;
    userEmail: string | null | undefined;
    urls: ImageUrlType[] | []; // 에디터에서 가져온 이미지 URL 배열
    attachments?: { id: string; name: string; key: string; size: number; mimeType: string }[]; // 다운로드 첨부(클라 평면 배열 — DocumentArray 아님)
};