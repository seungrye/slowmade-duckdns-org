import { InferSchemaType, Schema, model, models } from "mongoose";

// 이미지 URL과 썸네일 URL을 포함하는 객체
const ImageUrlSchema = new Schema(
  {
    url: String,
    thumbnailUrl: String,
  },
  { _id: false } // ← _id 생성하지 않음
);

const PostSchema = new Schema(
  {
    title: { type: String, required: true },  // 게시글 제목
    htmlContent: { type: String, required: true }, // 본문 (HTML 가능)
    jsonContent: { type: Object, required: true }, // JSON 형태의 본문 내용
    urls: { type: [ImageUrlSchema], default: [] }, // 이미지 URL 배열
    author: { type: String, required: true },  // 작성자 (닉네임 또는 ID)
    userEmail: { type: String, required: true }, // 작성자 Email
    likes: { type: Number, default: 0 }, // 좋아요 수
    views: { type: Number, default: 0 }, // 조회수
    createdAt: { type: Date, default: Date.now }, // 작성일
  },
  { timestamps: true }
);

// 타입 자동 추론
export type PostType = InferSchemaType<typeof PostSchema>
// 모델 생성
export default models.Post || model("Post", PostSchema);