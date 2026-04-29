import { NextRequest, NextResponse } from "next/server";
import * as Minio from 'minio';
import { buildFileName, buildPublicUrl, validateUploadFormData } from './upload.utils';
import { env } from '@/lib/env';
import { apiSuccess, apiError } from '@/lib/api-response';
import { requireAuth } from '@/lib/require-auth';

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: true,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
})

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const formData = await req.formData();
  const validation = validateUploadFormData(formData);

  if (!validation.ok) {
    return apiError(validation.error, 400);
  }

  const { file, thumbnail } = validation;
  const bucket = env.minio.bucket;
  const fileName = buildFileName(Date.now(), file.name);

  try {
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await minioClient.putObject(bucket, fileName, fileBuffer, file.size, {
      "Content-Type": file.type,
    });
  } catch (err) {
    console.error("MinIO upload failed:", err);
    return apiError("Upload failed", 500);
  }

  try {
    const thumbnailBuffer = Buffer.from(await thumbnail.arrayBuffer());
    await minioClient.putObject(bucket, `thumbnails/${fileName}`, thumbnailBuffer, thumbnail.size, {
      "Content-Type": thumbnail.type,
    });
  } catch (err) {
    console.error("MinIO thumbnail upload failed, rolling back:", err);
    try {
      await minioClient.removeObject(bucket, fileName);
    } catch (rollbackErr) {
      console.error("MinIO rollback failed:", rollbackErr);
    }
    return apiError("Upload failed", 500);
  }

  const url = buildPublicUrl(env.minio.endpoint, bucket, fileName);
  const thumbnailUrl = buildPublicUrl(env.minio.endpoint, bucket, `thumbnails/${fileName}`);

  console.log("File uploaded successfully:", url);

  return apiSuccess({ url, thumbnailUrl });
}
