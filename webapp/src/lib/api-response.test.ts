import { describe, it, expect } from 'vitest';
import { NextResponse } from 'next/server';
import { apiSuccess, apiError } from './api-response';

describe('apiSuccess', () => {
  it('data와 기본 200 상태코드로 응답한다', async () => {
    const res = apiSuccess({ foo: 'bar' });
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { foo: 'bar' } });
  });

  it('status 인자로 상태코드를 지정할 수 있다', async () => {
    const res = apiSuccess({}, 201);
    expect(res.status).toBe(201);
  });

  it('message가 있으면 응답 바디에 포함된다', async () => {
    const res = apiSuccess({ id: 1 }, 200, '저장 완료');
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { id: 1 }, message: '저장 완료' });
  });

  it('message가 없으면 응답 바디에 포함하지 않는다', async () => {
    const res = apiSuccess({ id: 1 });
    const body = await res.json();
    expect('message' in body).toBe(false);
  });

  it('data가 null이어도 응답한다', async () => {
    const res = apiSuccess(null);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: null });
  });

  it('data가 배열이어도 응답한다', async () => {
    const res = apiSuccess([1, 2, 3]);
    expect(await res.json()).toEqual({ success: true, data: [1, 2, 3] });
  });

  it('data가 falsy 값(false, 0)이어도 응답에 포함한다', async () => {
    expect(await apiSuccess(false).json()).toEqual({ success: true, data: false });
    expect(await apiSuccess(0).json()).toEqual({ success: true, data: 0 });
  });
});

describe('apiError', () => {
  it('message와 기본 500 상태코드로 응답한다', async () => {
    const res = apiError('서버 오류');
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ success: false, message: '서버 오류' });
  });

  it('status 인자로 상태코드를 지정할 수 있다', async () => {
    const res = apiError('찾을 수 없음', 404);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: '찾을 수 없음' });
  });

  it('400 상태코드로 잘못된 요청 오류를 반환한다', async () => {
    const res = apiError('필드가 없습니다.', 400);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, message: '필드가 없습니다.' });
  });

  it('응답 바디에 data 키가 없다', async () => {
    const body = await apiError('오류', 400).json();
    expect('data' in body).toBe(false);
  });
});
