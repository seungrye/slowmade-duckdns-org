import { NextRequest, NextResponse } from "next/server";
import * as Minio from 'minio';
import { env } from '@/lib/env';
import { apiSuccess, apiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';
import { buildPublicUrl } from '@/app/api/upload/upload.utils';
import { validateAudioFormData, buildAudioKey } from './audio-upload.utils';

// web-adventure BGM/SFX upload - it puts a single audio file into MinIO and returns a public URL.
// Separate from the image /api/upload (which requires a thumbnail), and unlike the downloadable /api/attachment/upload
// (with its private key) it returns a public URL so the author can use it straight away.

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

  // The public URL is based on publicHost (the apex path) - the server connection still uses the endpoint.
  const url = buildPublicUrl(env.minio.publicHost, bucket, key);
  return apiSuccess({ url });
}
