import { SortOption } from "@/lib/sort"
import { CommentType } from "@/models/comment"
import { PostType } from "@/models/post"

export type GetPostType = PostType & {
  _id: string  // InferSchemaType에는 이게 없음
  commentCount?: number
  comments?: CommentType[]
}

export type SetPostQuery = {
  page?: number
  limit?: number
  userEmail?: string
  query?: string
  sort?: SortOption
  withComments?: boolean
}