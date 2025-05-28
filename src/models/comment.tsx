import mongoose, { InferSchemaType } from "mongoose";

const CommentSchema = new mongoose.Schema(
    {
      post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true }, // 어떤 게시글의 댓글인지
      author: { type: String, required: true }, // 작성자
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // 작성자 ID
      content: { type: String, required: true }, // 댓글 내용
      likes: { type: Number, default: 0 }, // 좋아요 수
      createdAt: { type: Date, default: Date.now }, // 작성일
    },
    { timestamps: true }
  );
  
  // 타입 자동 추론
  export type CommentType = InferSchemaType<typeof CommentSchema>
  // 모델 생성
  module.exports = mongoose.model("Comment", CommentSchema);
  