import { NextRequest, NextResponse } from "next/server";
import * as Minio from 'minio';
import { env } from '@/lib/env';
import { connectToDB } from '@/lib/db';
import Post from '@/models/post';
import { auth } from '@/auth';

// 첨부 다운로드 프록시 — MinIO 오브젝트를 서버가 인증 검사 후 스트리밍.
// 공개 글 첨부는 누구나, 비공개 글 첨부는 작성자 본인만(정적 public URL 노출 안 함).

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: true,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

type AttMeta = { name?: string; key?: string; size?: number; mimeType?: string };

export async function GET(req: NextRequest, ctx: { params: Promise<{ postId: string }> }) {
  const { postId } = await ctx.params;
  const i = parseInt(new URL(req.url).searchParams.get('i') || '', 10);
  if (!postId || Number.isNaN(i) || i < 0) {
    return new NextResponse('Bad Request', { status: 400 });
  }

  await connectToDB();
  const post = await Post.findOne({ _id: postId, isDeleted: { $ne: true } })
    .select('isPrivate userEmail attachments')
    .lean<{ isPrivate?: boolean; userEmail?: string; attachments?: AttMeta[] } | null>();
  if (!post) return new NextResponse('Not Found', { status: 404 });

  // 비공개 글 첨부는 작성자 본인만(글이 안 보이면 파일도 안 보인다).
  if (post.isPrivate) {
    const session = await auth();
    if (session?.user?.email !== post.userEmail) {
      return new NextResponse('Not Found', { status: 404 });
    }
  }

  const att = post.attachments?.[i];
  if (!att?.key) return new NextResponse('Not Found', { status: 404 });

  try {
    const stream = await minioClient.getObject(env.minio.bucket, att.key);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks); // 최대 15MB — 버퍼링 허용
    const filename = encodeURIComponent(att.name || 'download');
    return new NextResponse(body, {
      headers: {
        'Content-Type': att.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'Content-Length': String(body.length),
        'Cache-Control': 'private, no-store', // 비공개 첨부가 공유 캐시에 남지 않게
      },
    });
  } catch (err) {
    console.error('attachment download failed:', err);
    return new NextResponse('Not Found', { status: 404 });
  }
}
