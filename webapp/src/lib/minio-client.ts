// The MinIO client (created lazily and reused).
//
// It was a local function inside the painter route, but the scene-illustration worker (#158) needs the same client,
// so it was pulled out into a shared module. Two copies would let the connection settings diverge.

import * as Minio from 'minio';
import { env } from '@/lib/env';

let client: Minio.Client | null = null;

export function getMinioClient(): Minio.Client {
  if (!client) {
    client = new Minio.Client({
      endPoint: env.minio.endpoint,
      port: env.minio.port,
      useSSL: true,
      accessKey: env.minio.accessKey,
      secretKey: env.minio.secretKey,
    });
  }
  return client;
}
