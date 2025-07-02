import { SortOption } from "@/lib/sort"
import { PostType } from "@/models/post"

export type GetPostType = PostType & {
  _id: string  // InferSchemaType에는 이게 없음
  commentCount?: number
}

export type SetPostQuery = {
  page?: number
  limit?: number
  userEmail?: string
  query?: string
  sort?: SortOption
  withComments?: boolean
}