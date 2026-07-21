import { CommentType } from "@/models/comment";

export type Comment = CommentType & {
  _id: string;
  parent: { _id: string; author: string } | null;
  isDeleted?: boolean;
  isEnji?: boolean;
  imageUrl?: string | null;
  imagePrompt?: string | null;
  authorId?: { name: string } | null; // email 은 서버에서 제거(PII) — 소유판정은 isOwn 사용
  isOwn?: boolean; // 서버가 계산한 "내 댓글" 여부(삭제 버튼 노출용). 이메일 노출 대체.
};
