import { NextRequest, NextResponse } from "next/server";
import * as Minio from 'minio';
import { buildFileName, buildPublicUrl, validateUploadFormData } from './upload.utils';

console.assert(process.env.MINIO_ENDPOINT, 'MINIO_ENDPOINT is not defined');
console.assert(process.env.MINIO_ACCESSKEY, 'MINIO_ACCESSKEY is not defined');
console.assert(process.env.MINIO_SECRETKEY, 'MINIO_SECRETKEY is not defined');
console.assert(process.env.MINIO_BUCKET, 'MINIO_BUCKET is not defined');

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT!,
  port: process.env.MINIO_PORT ? parseInt(process.env.MINIO_PORT) : undefined,
  useSSL: true,
  accessKey: process.env.MINIO_ACCESSKEY,
  secretKey: process.env.MINIO_SECRETKEY,
})

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const validation = validateUploadFormData(formData);

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { file, thumbnail } = validation;
  const bucket = process.env.MINIO_BUCKET!;
  const fileName = buildFileName(Date.now(), file.name);

  try {
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await minioClient.putObject(bucket, fileName, fileBuffer, file.size, {
      "Content-Type": file.type,
    });
  } catch (err) {
    console.error("MinIO upload failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
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
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const url = buildPublicUrl(process.env.MINIO_ENDPOINT!, bucket, fileName);
  const thumbnailUrl = buildPublicUrl(process.env.MINIO_ENDPOINT!, bucket, `thumbnails/${fileName}`);

  console.log("File uploaded successfully:", url);

  return NextResponse.json({ url, thumbnailUrl });
}
