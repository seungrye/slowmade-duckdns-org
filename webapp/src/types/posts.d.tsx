import { SortOption } from "@/lib/sort"
import { PostType } from "@/models/post"

export type GetPostType = PostType & {
  _id: string  // InferSchemaType does not have this
  commentCount?: number
}

export type SetPostQuery = {
  page?: number
  limit?: number
  userEmail?: string   // Scoping by author (that author's posts only) - the dashboard and my posts
  viewerEmail?: string // The viewer's email - for deciding access to a private post (the author alone)
  query?: string
  sort?: SortOption
  withComments?: boolean
}