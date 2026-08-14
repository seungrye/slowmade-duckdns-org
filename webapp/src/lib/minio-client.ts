// MinIO 클라이언트 (지연 생성·재사용).
//
// painter 라우트 안의 지역 함수였는데, 씬 삽화 워커(#158)도 같은 클라이언트가 필요해
// 공용 모듈로 뺐다. 두 벌로 두면 접속 설정이 갈린다.

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
