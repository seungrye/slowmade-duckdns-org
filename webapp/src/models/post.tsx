import { InferSchemaType, Schema, model, models, Model } from "mongoose";

// The object holding the image URL and the thumbnail URL
const ImageUrlSchema = new Schema(
  {
    url: String,
    thumbnailUrl: String,
  },
  { _id: false } // <- no _id is generated
);

// Downloadable attachments (separate from the body's images). key is the MinIO object key - not a public URL;
// the authenticated proxy (/api/attachment) resolves the key and streams it (protecting a private post's attachments).
const AttachmentSchema = new Schema(
  {
    id: String, // 클라 생성 랜덤 id (다운로드 링크·삭제 식별용)
    name: String, // 원본 파일명
    key: String, // MinIO 오브젝트 키
    size: Number, // 바이트
    mimeType: String,
  },
  { _id: false }
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
        index: true // An index is added for the performance of searching by tag later.
    },
    // The tags the AI (Gemini) added automatically from the body (telling them from the user's tags and deciding their colour).
    // aiTags is a subset of tags - merged into tags, so search and aggregation work normally; only the origin is marked here.
    aiTags: {
        type: [String],
        default: [],
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
    isPrivate: {
      type: Boolean,
      default: false, // 기본 공개. true 면 작성자 본인만 열람(비공개).
      index: true,
    },
    attachments: { type: [AttachmentSchema], default: [] }, // 다운로드 첨부파일
  },
  { timestamps: true }
);

// The type is inferred automatically
export type PostType = InferSchemaType<typeof PostSchema>;
export type ImageUrlType = InferSchemaType<typeof ImageUrlSchema>;
export type AttachmentType = InferSchemaType<typeof AttachmentSchema>;

// Creating the model
const Post: Model<PostType> = models.Post || model<PostType>("Post", PostSchema);

export default Post;