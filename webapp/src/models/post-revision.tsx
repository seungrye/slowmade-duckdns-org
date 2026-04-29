import { InferSchemaType, model, models, Schema } from 'mongoose';

const PostRevisionSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    title: { type: String, required: true },  // 게시글 제목
    htmlContent: { type: String, required: true }, // 본문 (HTML 가능)
    jsonContent: { type: Object, required: true }, // JSON 형태의 본문 내용
    author: { type: String, required: true },  // 작성자 (닉네임 또는 ID)
    userEmail: { type: String, required: true }, // 작성자 Email
    version: { type: Number, required: true },
    createdAt: { type: Date, required: true },
});


// 타입 자동 추론
export type PostRevisionType = InferSchemaType<typeof PostRevisionSchema>;
// 모델 생성
export default models.PostRevision || model("PostRevision", PostRevisionSchema);
