import { model, models, Schema } from 'mongoose';

const PostRevisionSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    title: { type: String, required: true },  // 게시글 제목
    htmlContent: { type: String, required: true }, // 본문 (HTML 가능)
    jsonContent: { type: Object, required: true }, // JSON 형태의 본문 내용
    version: { type: Number, required: true },
    createdAt: { type: Date, required: true },
});

// 모델 생성
export default models.PostRevision || model("PostRevision", PostRevisionSchema);
