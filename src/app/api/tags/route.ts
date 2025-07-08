import { NextRequest, NextResponse } from 'next/server';
import { connectToDB } from '@/lib/db';
import Post from '@/models/post';

/**
 * Fetches existing tags for autocomplete suggestions.
 * @param req - The Next.js request object, containing the search query.
 * @returns A JSON response with a list of matching tags.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || '';

  if (!query) {
    return NextResponse.json([]);
  }

  try {
    await connectToDB();

    const pipeline = [
      // Filter for documents that contain at least one matching tag and are not deleted
      { $match: { isDeleted: { $ne: true }, tags: { $regex: `^${query}`, $options: 'i' } } },
      // Unwind the tags array to process each tag individually
      { $unwind: '$tags' },
      // Filter the unwound tags again to ensure they match the query
      { $match: { tags: { $regex: `^${query}`, $options: 'i' } } },
      // Group by tag to get unique values
      { $group: { _id: '$tags' } },
      // Limit the number of suggestions
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