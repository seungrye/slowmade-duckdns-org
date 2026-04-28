import { NextRequest } from 'next/server';
import { connectToDB } from '@/lib/db';
import { __getAllTags } from '@/lib/posts';
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

    if (!query) { // get all tags
      const tags = await __getAllTags();
      return apiSuccess(tags.map((item) => item.tag));
    }

    const escapedQuery = escapeRegex(query);
    const pipeline: PipelineStage[] = [
      { $match: { isDeleted: { $ne: true }, tags: { $regex: escapedQuery, $options: 'i' } } },
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