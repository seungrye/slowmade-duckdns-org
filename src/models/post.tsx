import mongoose, { Schema, model, models } from "mongoose";

const PostSchema = new Schema(
  {
    title: { type: String, required: true },  // 게시글 제목
    content: { type: String, required: true }, // 본문 (HTML 가능)
    author: { type: String, required: true },  // 작성자 (닉네임 또는 ID)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // 작성자 ID
    likes: { type: Number, default: 0 }, // 좋아요 수
    views: { type: Number, default: 0 }, // 조회수
    comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Comment" }], // 댓글 참조
    createdAt: { type: Date, default: Date.now }, // 작성일
  },
  { timestamps: true }
);

export default models.Post || model("Post", PostSchema);