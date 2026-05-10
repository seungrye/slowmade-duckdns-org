import { describe, it, expect } from 'vitest';
import { GET } from './route';

// 무중단 배포 헬스체크 엔드포인트 — deploy.sh 가 새 인스턴스 기동 후 폴링한다.
describe('GET /api/health', () => {
  it('200 과 함께 { success: true, data: { ok: true } } 를 반환한다', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { ok: true } });
  });
});
