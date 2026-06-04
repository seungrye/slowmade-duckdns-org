import mongoose, { InferSchemaType, model, models } from "mongoose";

const CommentSchema = new mongoose.Schema(
    {
      post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true }, // 어떤 게시글의 댓글인지
      parent: { type: mongoose.Schema.Types.ObjectId, ref: "Comment", default: null }, // 부모 댓글 ID
      author: { type: String, required: true }, // 작성자
      authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // 작성자 ID
      content: { type: String, required: true }, // 댓글 내용
      likes: { type: Number, default: 0 }, // 좋아요 수
      createdAt: { type: Date, default: Date.now }, // 작성일
      isDeleted: { type: Boolean, default: false },  // 삭제 플래그 추가
      isEnji: { type: Boolean, default: false },
      imageUrl: { type: String, default: null }, // enji-bot 이미지 생성 결과 URL (MinIO public URL)
      imagePrompt: { type: String, default: null }, // 원본 prompt (검색/디버깅용)
    },
    { timestamps: true }
  );
  
  // 타입 자동 추론
  export type CommentType = InferSchemaType<typeof CommentSchema>
  // 모델 생성
  export default models.Comment || model("Comment", CommentSchema);
  