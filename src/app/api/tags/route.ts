import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import { __getAllTags } from '@/lib/posts';
import Post from '@/models/post';
import { PipelineStage } from 'mongoose';

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
      return NextResponse.json(tags.map((item) => item.tag));
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

    return NextResponse.json(tagStrings);
  } catch (error) {
    console.error('Error fetching tags:', error);
    return NextResponse.json({ message: 'Failed to fetch tags' }, { status: 500 });
  }
}