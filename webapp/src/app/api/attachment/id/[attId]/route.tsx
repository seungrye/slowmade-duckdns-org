import { NextRequest, NextResponse } from "next/server";
import * as Minio from 'minio';
import { env } from '@/lib/env';
import { connectToDB } from '@/lib/db';
import Post from '@/models/post';
import { auth } from '@/auth';

// The attachment download proxy - **keyed by attachment id**. It lets an inline attachment chip in the body point
// reliably even before the post is saved (no post id needed). It finds the post holding that attachment, allows it if public or if the viewer is the author, then streams from MinIO.

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: true,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

type AttMeta = { id?: string; name?: string; key?: string; size?: number; mimeType?: string };

export async function GET(req: NextRequest, ctx: { params: Promise<{ attId: string }> }) {
  const { attId } = await ctx.params;
  if (!attId) return new NextResponse('Bad Request', { status: 400 });

  await connectToDB();
  const post = await Post.findOne({ 'attachments.id': attId, isDeleted: { $ne: true } })
    .select('isPrivate userEmail attachments')
    .lean<{ isPrivate?: boolean; userEmail?: string; attachments?: AttMeta[] } | null>();
  if (!post) return new NextResponse('Not Found', { status: 404 });

  // A private post's attachment is the author's alone.
  if (post.isPrivate) {
    const session = await auth();
    if (session?.user?.email !== post.userEmail) {
      return new NextResponse('Not Found', { status: 404 });
    }
  }

  const att = post.attachments?.find((a) => a.id === attId);
  if (!att?.key) return new NextResponse('Not Found', { status: 404 });

  try {
    const stream = await minioClient.getObject(env.minio.bucket, att.key);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const filename = encodeURIComponent(att.name || 'download');
    return new NextResponse(body, {
      headers: {
        'Content-Type': att.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'Content-Length': String(body.length),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('attachment(by-id) download failed:', err);
    return new NextResponse('Not Found', { status: 404 });
  }
}
