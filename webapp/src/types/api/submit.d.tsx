import { ImageUrlType, PostType } from "@/models/post";

/**
 * The type that overrides some of PostType's fields and adds the _id field
 * Mongoose's InferSchemaType cannot infer.
 * The Omit utility type explicitly excludes the existing type and overwrites it with the new one.
 */
export type SetPostType = Omit<PostType, 'author' | 'userEmail' | 'urls' | 'attachments' | 'likes' | 'dislikes' | 'views' | 'createdAt' | 'updatedAt'> & {
    _id: string | null; // A Mongoose Document's _id is an ObjectId, but the client handles it as a string, or as null for a new post.
    author: string | null | undefined;
    userEmail: string | null | undefined;
    urls: ImageUrlType[] | []; // The array of image URLs taken from the editor
    attachments?: { id: string; name: string; key: string; size: number; mimeType: string }[]; // The downloadable attachments (a flat client array - not a DocumentArray)
};