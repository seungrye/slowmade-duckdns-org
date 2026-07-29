import { NextRequest, NextResponse } from "next/server";
import * as Minio from 'minio';
import { env } from '@/lib/env';
import { apiSuccess, apiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { buildPublicUrl } from '@/app/api/upload/upload.utils';
import { validateAudioFormData, buildAudioKey } from './audio-upload.utils';

// web-adventure BGM/SFX 업로드 — 단일 오디오 파일을 MinIO 에 올리고 public URL 을 반환.
// 이미지용 /api/upload(썸네일 필수)와 분리, 다운로드 첨부 /api/attachment/upload(비공개 key)와
// 달리 저작자가 바로 쓸 수 있도록 public URL 을 돌려준다.

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: true,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const formData = await req.formData();
  const validation = validateAudioFormData(formData);
  if (!validation.ok) return apiError(validation.error, 400);

  const { file } = validation;
  const bucket = env.minio.bucket;
  const key = buildAudioKey(Date.now(), file.name);

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    await minioClient.putObject(bucket, key, buf, file.size, {
      "Content-Type": file.type || 'application/octet-stream',
    });
  } catch (err) {
    console.error("MinIO audio upload failed:", err);
    return apiError("Upload failed", 500);
  }

  // public URL 은 publicHost(apex 경로) 기반 — 서버 연결은 endpoint 그대로.
  const url = buildPublicUrl(env.minio.publicHost, bucket, key);
  return apiSuccess({ url });
}
