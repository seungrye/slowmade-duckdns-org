import { connectToDB } from "@/lib/db";
import Post from "@/models/post";

export async function getPosts() {
  await connectToDB();
  return await Post.find({}).sort({ createdAt: -1 }).limit(12).lean();
}
