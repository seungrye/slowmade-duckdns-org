import { CommentType } from "@/models/comment";

export type Comment = CommentType & {
  _id: string;
  parent: { _id: string; author: string } | null;
  isDeleted?: boolean;
  isEnji?: boolean;
  imageUrl?: string | null;
  imagePrompt?: string | null;
  authorId?: { name: string } | null; // The email is stripped on the server (PII) - ownership uses isOwn
  isOwn?: boolean; // Whether it is "my comment", computed by the server (for showing the delete button). Replacing the exposed email.
};
