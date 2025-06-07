// app/api/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import * as Minio from 'minio' // MinIO 클라이언트 설정

console.assert(process.env.MINIO_ENDPOINT, 'MINIO_ENDPOINT is not defined');
console.assert(process.env.MINIO_ACCESSKEY, 'MINIO_ACCESSKEY is not defined');
console.assert(process.env.MINIO_SECRETKEY, 'MINIO_SECRETKEY is not defined');

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT!,
  // port: parseInt(process.env.MINIO_PORT!),
  useSSL: true,
  accessKey: process.env.MINIO_ACCESSKEY,
  secretKey: process.env.MINIO_SECRETKEY,
})

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const thumbnail = formData.get("thumbnail") as File;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const fileName = `${Date.now()}-${file.name}`;

  // 업로드
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  await minioClient.putObject(process.env.MINIO_BUCKET || "", fileName, fileBuffer, file.size,{
    "Content-Type": file.type,
  });
  const publicUrl = `https://${process.env.MINIO_ENDPOINT}/${process.env.MINIO_BUCKET}/${fileName}`;

  const thumbnailBuffer = Buffer.from(await thumbnail.arrayBuffer());
  await minioClient.putObject(process.env.MINIO_BUCKET || "", `thumbnails/${fileName}`, thumbnailBuffer, thumbnail.size,{
    "Content-Type": thumbnail.type,
  });
  const publicThumbnailUrl = `https://${process.env.MINIO_ENDPOINT}/${process.env.MINIO_BUCKET}/thumbnails/${fileName}`;

  console.log("File uploaded successfully:", publicUrl);

  return NextResponse.json({ url: publicUrl, thumbnailUrl: publicThumbnailUrl });
}
