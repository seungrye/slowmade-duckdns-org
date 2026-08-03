import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('axios', () => ({ default: { post: vi.fn() } }));

import axios from 'axios';
import { uploadAttachment } from './editor.upload';

const mockPost = (axios as unknown as { post: ReturnType<typeof vi.fn> }).post;

const META = { id: 'a1', name: 'doc.pdf', key: 'attachments/uuid-doc.pdf', size: 123, mimeType: 'application/pdf' };
function file(name = 'doc.pdf', type = 'application/pdf'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe('uploadAttachment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: { success: true, data: META } });
  });

  it('FormData 로 /api/attachment/upload 에 POST 하고 AttachmentMeta 를 반환', async () => {
    const f = file();
    const meta = await uploadAttachment(f);
    expect(meta).toEqual(META);
    const [url, fd, config] = mockPost.mock.calls[0];
    expect(url).toBe('/api/attachment/upload');
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).get('file')).toBe(f);
    expect(typeof config.onUploadProgress).toBe('function');
  });

  it('onUploadProgress → onProgress 콜백(퍼센트) 호출', async () => {
    const onProgress = vi.fn();
    await uploadAttachment(file(), onProgress);
    const config = mockPost.mock.calls[0][2];
    config.onUploadProgress({ loaded: 25, total: 100 });
    config.onUploadProgress({ loaded: 100, total: 100 });
    expect(onProgress).toHaveBeenNthCalledWith(1, { progress: 25 });
    expect(onProgress).toHaveBeenNthCalledWith(2, { progress: 100 });
  });

  it('total 이 없으면(진행률 미상) onProgress 를 호출하지 않는다', async () => {
    const onProgress = vi.fn();
    await uploadAttachment(file(), onProgress);
    const config = mockPost.mock.calls[0][2];
    config.onUploadProgress({ loaded: 25, total: undefined });
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('앱 JSON 에러(400, 한글 message) → 그 message 로 throw', async () => {
    mockPost.mockRejectedValue({ response: { status: 400, data: { message: '허용되지 않는 파일 형식입니다.' } } });
    await expect(uploadAttachment(file())).rejects.toThrow('허용되지 않는 파일 형식입니다.');
  });

  it('nginx HTML 413(비JSON body) → 친절한 한글 메시지로 throw(SyntaxError 아님)', async () => {
    mockPost.mockRejectedValue({ response: { status: 413, data: '<html><head><title>413</title></head></html>' } });
    await expect(uploadAttachment(file())).rejects.toThrow(/파일이 너무 큽니다/);
  });

  it('네트워크 오류(response 없음) → 일반 실패 메시지로 throw', async () => {
    mockPost.mockRejectedValue(new Error('Network Error'));
    await expect(uploadAttachment(file())).rejects.toThrow(/업로드에 실패/);
  });
});
