import { CommentType } from "@/models/comment";

export type Comment = CommentType & {
  _id: string;
  parent: { _id: string; author: string } | null;
  isDeleted?: boolean;
  isEnji?: boolean;
  imageUrl?: string | null;
  imagePrompt?: string | null;
  authorId?: { email: string; name: string } | null;
};
