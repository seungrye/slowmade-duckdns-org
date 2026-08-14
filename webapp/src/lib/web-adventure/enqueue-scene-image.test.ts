// 엔딩 → 씬 삽화 큐 적재 (#158).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const countDocuments = vi.fn();
const create = vi.fn();
const sceneFind = vi.fn();

vi.mock('@/models/web-adventure-scene-image', () => ({
  default: {
    countDocuments: (...a: unknown[]) => countDocuments(...a),
    create: (...a: unknown[]) => create(...a),
  },
}));
vi.mock('@/models/web-adventure-scene', () => ({
  default: { find: (...a: unknown[]) => sceneFind(...a) },
}));

import { enqueueSceneImage, MAX_PENDING_SCENE_IMAGES } from './enqueue-scene-image';

const RUN = { _id: 'run1', runIndex: 3, endingId: 'ending_a', finalSceneId: 's9' };

function scenes(list: Array<{ id: string; illustrations?: string[] }>) {
  sceneFind.mockReturnValue({ select: () => ({ lean: async () => list }) });
}

describe('enqueueSceneImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    countDocuments.mockResolvedValue(0);
    create.mockResolvedValue({});
    scenes([{ id: 'a' }, { id: 'b' }]);
  });

  it('회차 하나당 한 건을 넣는다', async () => {
    await enqueueSceneImage(RUN, 'me@x.test', { rand: () => 0 });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      sceneId: 'a',
      sourceUserEmail: 'me@x.test',
      endingId: 'ending_a',
      status: 'queued',
    });
  });

  it('프롬프트를 미리 만들어 넣는다 — 워커가 다시 계산하지 않게', async () => {
    scenes([{ id: 'a' }]);
    await enqueueSceneImage(RUN, 'me@x.test', { rand: () => 0 });
    expect(create.mock.calls[0][0].prompt).toBeTruthy();
  });

  // 느린 단일 워커라 큐가 밀리면 무한정 쌓인다.
  it('대기가 많으면 넣지 않는다', async () => {
    countDocuments.mockResolvedValue(MAX_PENDING_SCENE_IMAGES);
    await enqueueSceneImage(RUN, 'me@x.test', { rand: () => 0 });
    expect(create).not.toHaveBeenCalled();
  });

  it('씬이 없으면 조용히 넘어간다', async () => {
    scenes([]);
    await enqueueSceneImage(RUN, 'me@x.test', { rand: () => 0 });
    expect(create).not.toHaveBeenCalled();
  });

  it('회차가 없으면 아무것도 안 한다', async () => {
    await enqueueSceneImage(null, 'me@x.test', { rand: () => 0 });
    expect(create).not.toHaveBeenCalled();
  });

  // 엔딩 종결을 막으면 안 된다 — 그림은 곁다리다.
  it('실패해도 던지지 않는다', async () => {
    create.mockRejectedValue(new Error('db down'));
    await expect(enqueueSceneImage(RUN, 'me@x.test', { rand: () => 0 })).resolves.toBeUndefined();
  });

  it('씬 조회가 터져도 던지지 않는다', async () => {
    sceneFind.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(enqueueSceneImage(RUN, 'me@x.test', { rand: () => 0 })).resolves.toBeUndefined();
  });
});
