import { SortOption } from "@/lib/sort"
import { PostType } from "@/models/post"

export type GetPostType = PostType & {
  _id: string  // InferSchemaType에는 이게 없음
  commentCount?: number
}

export type SetPostQuery = {
  page?: number
  limit?: number
  userEmail?: string   // 작성자 스코핑(이 작성자 글만) — 대시보드/내 글
  viewerEmail?: string // 지금 보는 사람의 email — 비공개 글 열람 판정용(작성자 본인만)
  query?: string
  sort?: SortOption
  withComments?: boolean
}