import { InferSchemaType, Schema, model, models, Model } from "mongoose";

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
    version: { type: Number, default: 1 }, // 기본값 1로 설정
    tags: {
        type: [String],
        default: [],
        index: true // 나중에 태그로 검색할 때 성능 향상을 위해 인덱스를 추가합니다.
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true, // 삭제되지 않은 게시물을 필터링하는 쿼리의 성능을 향상시킵니다.
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// 타입 자동 추론
export type PostType = InferSchemaType<typeof PostSchema>;
export type ImageUrlType = InferSchemaType<typeof ImageUrlSchema>;

// 모델 생성
const Post: Model<PostType> = models.Post || model<PostType>("Post", PostSchema);

export default Post;