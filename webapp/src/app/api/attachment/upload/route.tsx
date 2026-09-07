import { NextRequest, NextResponse } from "next/server";
import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import { env } from '@/lib/env';
import { apiSuccess, apiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { isOwner } from '@/lib/require-owner';

// Downloadable attachment upload - separate from the image-only /api/upload (non-images allowed, no thumbnails).
// It returns only the MinIO object key and never exposes a public URL (protecting private posts' attachments -
// downloads go through the authenticated /api/attachment/[postId] proxy).

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: true,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

// Document, archive and data files are allowed (download only). Executable risks such as scripts, HTML and SVG are excluded.
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/zip', 'application/x-zip-compressed', 'application/x-7z-compressed',
  'application/x-hwp', 'application/haansofthwp', 'application/vnd.hancom.hwp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'text/markdown', 'application/json',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', // 이미지도 다운로드 첨부로 허용
]);
// Ordinary users: within nginx's server-level default client_max_body_size (16M).
const DEFAULT_MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
// Raised for the owner (admin): matched to the client_max_body_size (100M) on nginx's `location = /api/attachment/upload`.
const OWNER_MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // 100MB for the owner, 15MB for an ordinary logged-in user. isOwner is a boolean (a non-owner still uploads normally).
  const maxBytes = (await isOwner()) ? OWNER_MAX_ATTACHMENT_BYTES : DEFAULT_MAX_ATTACHMENT_BYTES;

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file || !(file instanceof File)) return apiError('No file uploaded', 400);
  if (file.size > maxBytes) {
    return apiError(`File too large (max ${maxBytes / (1024 * 1024)}MB)`, 413);
  }
  const mimeType = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.has(mimeType)) {
    return apiError('허용되지 않는 파일 형식입니다.', 400);
  }

  const bucket = env.minio.bucket;
  const safeName = file.name.replace(/[/\\]/g, '_').slice(0, 200) || 'file';
  const key = `attachments/${randomUUID()}-${safeName}`; // A random prefix - it prevents key guessing

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    await minioClient.putObject(bucket, key, buf, file.size, { 'Content-Type': mimeType });
  } catch (err) {
    console.error('MinIO attachment upload failed:', err);
    return apiError('Upload failed', 500);
  }

  return apiSuccess({ id: randomUUID(), name: safeName, key, size: file.size, mimeType });
}
