import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { connectToDB } from '@/lib/db';
import { __getAllTags, privacyMatch } from '@/lib/posts';
import Post from '@/models/post';
import { PipelineStage } from 'mongoose';
import { escapeRegex } from '@/lib/utils';
import { apiSuccess, apiError } from '@/lib/api-response';

/**
 * Fetches existing tags for autocomplete suggestions.
 * @param req - The Next.js request object, containing the search query.
 * @returns A JSON response with a list of matching tags.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q')?.trim() || '';

  try {
    await connectToDB();

    // 글을 쓰면서 **자기 태그를 다시 쓰는 것**이 자연스럽다. 그래서 자동완성도 작성자
    // 본인의 비공개 글 태그를 포함한다 (#230). 남의 비공개 글은 privacyMatch 가 막는다.
    const session = await auth();
    const viewerEmail = session?.user?.email ?? null;

    if (!query) { // get all tags
      const tags = await __getAllTags(viewerEmail);
      return apiSuccess(tags.map((item) => item.tag));
    }

    const escapedQuery = escapeRegex(query);
    const pipeline: PipelineStage[] = [
      { $match: { isDeleted: { $ne: true }, tags: { $regex: escapedQuery, $options: 'i' }, ...privacyMatch(viewerEmail) } },
      { $unwind: '$tags' },
      { $match: { tags: { $regex: escapedQuery, $options: 'i' } } },
      { $group: { _id: { $toLower: '$tags' } } },
      { $limit: 10 },
    ];

    const tags = await Post.aggregate(pipeline);
    const tagStrings = tags.map(item => item._id);

    return apiSuccess(tagStrings);
  } catch (error) {
    console.error('Error fetching tags:', error);
    return apiError('Failed to fetch tags', 500);
  }
}