import { NextRequest, NextResponse } from "next/server";
import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import { env } from '@/lib/env';
import { apiSuccess, apiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';

// 다운로드 첨부 업로드 — 이미지 전용 /api/upload 와 분리(비이미지 허용, 썸네일 없음).
// MinIO 오브젝트 키만 반환하고 public URL 은 노출하지 않는다(비공개 글 첨부 보호 —
// 다운로드는 /api/attachment/[postId] 인증 프록시가 담당).

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: true,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

// 문서·압축·데이터 파일 허용(다운로드 전용). 스크립트/HTML/SVG 등 실행 위험류는 배제.
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
// nginx client_max_body_size(16M) 이내.
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file || !(file instanceof File)) return apiError('No file uploaded', 400);
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return apiError(`File too large (max ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB)`, 413);
  }
  const mimeType = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.has(mimeType)) {
    return apiError('허용되지 않는 파일 형식입니다.', 400);
  }

  const bucket = env.minio.bucket;
  const safeName = file.name.replace(/[/\\]/g, '_').slice(0, 200) || 'file';
  const key = `attachments/${randomUUID()}-${safeName}`; // 랜덤 프리픽스 — 키 추측 방지

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    await minioClient.putObject(bucket, key, buf, file.size, { 'Content-Type': mimeType });
  } catch (err) {
    console.error('MinIO attachment upload failed:', err);
    return apiError('Upload failed', 500);
  }

  return apiSuccess({ id: randomUUID(), name: safeName, key, size: file.size, mimeType });
}
