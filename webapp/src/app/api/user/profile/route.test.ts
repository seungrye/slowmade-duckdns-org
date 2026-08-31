import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/user', () => ({ default: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));

import { GET, PUT } from './route';
import { auth } from '@/auth';
import User from '@/models/user';

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockFindOne = User.findOne as ReturnType<typeof vi.fn>;
const mockFindOneAndUpdate = User.findOneAndUpdate as ReturnType<typeof vi.fn>;

const signedIn = () => mockAuth.mockResolvedValue({ user: { email: 'me@test.com' }, expires: '' });

// GET 은 findOne(...).select(...) 체인을 쓴다.
const stubProfile = (doc: unknown) =>
  mockFindOne.mockReturnValue({ select: vi.fn().mockResolvedValue(doc) });

const putRequest = (body: unknown) =>
  new Request('http://localhost/api/user/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/user/profile', () => {
  it('인증되지 않으면 401', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it('생일을 함께 내려준다 — 프로필 폼이 초기값으로 쓴다', async () => {
    signedIn();
    stubProfile({ email: 'me@test.com', birthday: new Date('1990-03-15T00:00:00Z') });

    const res = await GET();
    const { data } = await res.json();

    expect(res.status).toBe(200);
    expect(new Date(data.birthday).toISOString()).toBe('1990-03-15T00:00:00.000Z');
    // select 목록에 birthday 가 빠지면 폼이 항상 비어 보인다.
    expect(mockFindOne.mock.results[0].value.select).toHaveBeenCalledWith(
      expect.stringContaining('birthday'),
    );
  });

  it('사용자가 없으면 404', async () => {
    signedIn();
    stubProfile(null);
    expect((await GET()).status).toBe(404);
  });
});

describe('PUT /api/user/profile', () => {
  it('인증되지 않으면 401', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await PUT(putRequest({ birthday: '1990-03-15' }))).status).toBe(401);
  });

  it('올바른 생일을 UTC 자정으로 저장한다', async () => {
    signedIn();
    mockFindOneAndUpdate.mockResolvedValue({ birthday: new Date('1990-03-15T00:00:00Z') });

    const res = await PUT(putRequest({ birthday: '1990-03-15' }));

    expect(res.status).toBe(200);
    const [filter, update] = mockFindOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ email: 'me@test.com' });
    expect(update.$set.birthday.toISOString()).toBe('1990-03-15T00:00:00.000Z');
  });

  it('빈 값이면 생일을 지운다', async () => {
    signedIn();
    mockFindOneAndUpdate.mockResolvedValue({});

    for (const body of [{ birthday: null }, { birthday: '' }]) {
      mockFindOneAndUpdate.mockClear();
      const res = await PUT(putRequest(body));
      expect(res.status).toBe(200);
      expect(mockFindOneAndUpdate.mock.calls[0][1]).toEqual({ $unset: { birthday: 1 } });
    }
  });

  it.each([
    ['형식 오류', '1990-3-15'],
    ['없는 날짜', '1990-02-30'],
    ['미래', '2999-01-01'],
    ['1900 년 이전', '1899-12-31'],
    ['문자열이 아님', 12345],
  ])('%s 이면 400 이고 저장하지 않는다', async (_label, birthday) => {
    signedIn();
    const res = await PUT(putRequest({ birthday }));
    expect(res.status).toBe(400);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('사용자가 없으면 404', async () => {
    signedIn();
    mockFindOneAndUpdate.mockResolvedValue(null);
    expect((await PUT(putRequest({ birthday: '1990-03-15' }))).status).toBe(404);
  });

  it('본문이 JSON 이 아니면 400', async () => {
    signedIn();
    const bad = new Request('http://localhost/api/user/profile', { method: 'PUT', body: 'not json' });
    expect((await PUT(bad)).status).toBe(400);
  });
});
