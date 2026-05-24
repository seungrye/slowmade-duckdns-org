import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/quest', () => ({ default: { findById: vi.fn() } }));
vi.mock('@/models/quest-revision', () => ({ default: { create: vi.fn(), deleteMany: vi.fn() } }));
vi.mock('@/models/villager', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/item', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/zone', () => ({ default: { find: vi.fn() } }));

import { GET, PUT, DELETE } from './route';
import Quest from '@/models/quest';
import QuestRevision from '@/models/quest-revision';
import Villager from '@/models/villager';
import Item from '@/models/item';
import Zone from '@/models/zone';

// PUT 라우트는 카탈로그 3종을 fetch — 테스트에서 빈 카탈로그로 모킹
function mockEmptyCatalogs() {
  const empty = { lean: vi.fn().mockResolvedValue([]) };
  (Villager.find as ReturnType<typeof vi.fn>).mockReturnValue({ select: vi.fn().mockReturnValue(empty) });
  (Item.find as ReturnType<typeof vi.fn>).mockReturnValue({ select: vi.fn().mockReturnValue(empty) });
  (Zone.find as ReturnType<typeof vi.fn>).mockReturnValue({ select: vi.fn().mockReturnValue(empty) });
}

const params = Promise.resolve({ id: 'test-id' });

function makeRequest(method: string, body?: object): NextRequest {
  return new Request(`http://localhost/api/quests/test-id`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }) as unknown as NextRequest;
}

describe('GET /api/quests/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('퀘스트를 찾지 못하면 404를 반환한다', async () => {
    (Quest.findById as ReturnType<typeof vi.fn>).mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await GET(makeRequest('GET'), { params });
    expect(res.status).toBe(404);
  });

  it('lean() plain object phases를 그대로 반환한다', async () => {
    (Quest.findById as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        id: 'q1', title: '퀘스트', giverNpc: '', initialPhase: 'dormant',
        phases: { dormant: { dialog: ['안녕'], objective: null } },
        transitions: [], spawns: [], version: 1,
      }),
    });
    const res = await GET(makeRequest('GET'), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.phases).toHaveProperty('dormant');
    expect(body.data.phases.dormant.dialog).toEqual(['안녕']);
  });

  it('lean() Map 인스턴스 phases도 처리한다', async () => {
    (Quest.findById as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        id: 'q1', title: '퀘스트', giverNpc: '', initialPhase: 'dormant',
        phases: new Map([['dormant', { dialog: [], objective: null }]]),
        transitions: [], spawns: [], version: 1,
      }),
    });
    const res = await GET(makeRequest('GET'), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.phases).toHaveProperty('dormant');
  });
});

describe('DELETE /api/quests/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('퀘스트를 찾지 못하면 404를 반환한다', async () => {
    (Quest.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE'), { params });
    expect(res.status).toBe(404);
  });

  it('퀘스트와 revision을 삭제하고 200을 반환한다', async () => {
    const mockQuest = {
      _id: 'mongo-id', id: 'q1',
      deleteOne: vi.fn().mockResolvedValue(undefined),
    };
    (Quest.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockQuest);
    (QuestRevision.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await DELETE(makeRequest('DELETE'), { params });
    expect(res.status).toBe(200);
    expect(QuestRevision.deleteMany).toHaveBeenCalledWith({ questId: 'mongo-id' });
    expect(mockQuest.deleteOne).toHaveBeenCalled();
  });
});

describe('PUT /api/quests/[id]', () => {
  beforeEach(() => { vi.clearAllMocks(); mockEmptyCatalogs(); });

  it('퀘스트를 찾지 못하면 404를 반환한다', async () => {
    (Quest.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PUT(makeRequest('PUT', { title: '새 제목' }), { params });
    expect(res.status).toBe(404);
  });

  it('title을 업데이트하고 revision을 생성한다', async () => {
    const mockPhases = new Map([['dormant', { dialog: [] }]]);
    const mockQuest = {
      _id: 'mongo-id', id: 'q1', title: '기존 제목', giverNpc: '',
      initialPhase: 'dormant', phases: mockPhases, spawns: [], version: 1,
      save: vi.fn().mockResolvedValue(undefined),
      toObject: vi.fn().mockReturnValue({ id: 'q1', title: '새 제목', giverNpc: '', initialPhase: 'dormant', spawns: [], version: 2 }),
    };
    (Quest.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockQuest);
    (QuestRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await PUT(makeRequest('PUT', { title: '새 제목' }), { params });
    expect(res.status).toBe(200);
    expect(mockQuest.title).toBe('새 제목');
    expect(mockQuest.version).toBe(2);
    expect(QuestRevision.create).toHaveBeenCalledWith(expect.objectContaining({ questId: 'mongo-id', version: 1 }));
  });

  it('응답 data에 갱신된 version이 포함된다', async () => {
    const mockPhases = new Map([['dormant', { dialog: [] }]]);
    const mockQuest = {
      _id: 'mongo-id', id: 'q1', title: 'T', giverNpc: '',
      initialPhase: 'dormant', phases: mockPhases, spawns: [], version: 3,
      save: vi.fn().mockResolvedValue(undefined),
      toObject: vi.fn().mockReturnValue({ id: 'q1', title: 'T', spawns: [], version: 4, phases: mockPhases }),
    };
    (Quest.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockQuest);
    (QuestRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await PUT(makeRequest('PUT', { title: 'T' }), { params });
    const body = await res.json();
    expect(body.data.version).toBe(4);
  });

  it('body.phases를 Map으로 변환해서 저장한다', async () => {
    const mockPhases = new Map([['dormant', { dialog: [] }]]);
    const mockQuest = {
      _id: 'mongo-id', id: 'q1', title: 'T', giverNpc: '',
      initialPhase: 'dormant', phases: mockPhases, spawns: [], version: 1,
      save: vi.fn().mockResolvedValue(undefined),
      toObject: vi.fn().mockReturnValue({ id: 'q1', title: 'T', spawns: [], version: 2 }),
    };
    (Quest.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockQuest);
    (QuestRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const newPhases = { active: { dialog: ['반응'], objective: null } };
    await PUT(makeRequest('PUT', { phases: newPhases }), { params });

    expect(mockQuest.phases).toBeInstanceOf(Map);
    expect(mockQuest.phases.get('active')).toEqual(newPhases.active);
  });

  it('body.transitions를 저장한다', async () => {
    const mockQuest = {
      _id: 'mongo-id', id: 'q1', title: 'T', giverNpc: '',
      initialPhase: 'a', phases: new Map([['a', { dialog: [] }]]), transitions: [], spawns: [], version: 1,
      save: vi.fn().mockResolvedValue(undefined),
      toObject: vi.fn().mockReturnValue({ id: 'q1', title: 'T', spawns: [], version: 2 }),
    };
    (Quest.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockQuest);
    (QuestRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const transitions = [{ from: 'a', trigger: 'Interact', actions: [], to: 'a' }];
    await PUT(makeRequest('PUT', { transitions }), { params });

    expect(mockQuest.transitions).toEqual(transitions);
  });

  it('정상 카탈로그면 응답에 warnings: [] 포함 (저장 성공)', async () => {
    const mockPhases = new Map([['dormant', { dialog: [], objective: null }]]);
    const mockQuest = {
      _id: 'mongo-id', id: 'q1', title: 'T', giverNpc: 'elder',
      initialPhase: 'dormant', phases: mockPhases, transitions: [], spawns: [], version: 1,
      save: vi.fn().mockResolvedValue(undefined),
      toObject: vi.fn().mockReturnValue({ id: 'q1', title: 'T', giverNpc: 'elder', spawns: [], version: 2 }),
    };
    (Quest.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockQuest);
    (QuestRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    // elder 가 등록된 villager 카탈로그 (id 기준)
    (Villager.find as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ id: 'elder' }]) }),
    });

    const res = await PUT(makeRequest('PUT', {}), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.warnings).toEqual([]);
  });

  it('끊어진 참조가 있으면 warnings 에 보고하고 저장은 성공', async () => {
    const mockPhases = new Map([
      ['dormant', { dialog: [], objective: null }],
      ['next', { dialog: [], objective: null }],
    ]);
    const transitions = [
      { from: 'dormant', trigger: 'Interact', actions: [{ type: 'GiveItem', itemId: '없는item' }], to: 'next' },
    ];
    const mockQuest = {
      _id: 'mongo-id', id: 'q1', title: 'T', giverNpc: '없는NPC',
      initialPhase: 'dormant', phases: mockPhases, transitions, spawns: [], version: 1,
      save: vi.fn().mockResolvedValue(undefined),
      toObject: vi.fn().mockReturnValue({ id: 'q1', title: 'T', giverNpc: '없는NPC', spawns: [], version: 2 }),
    };
    (Quest.findById as ReturnType<typeof vi.fn>).mockResolvedValue(mockQuest);
    (QuestRevision.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await PUT(makeRequest('PUT', {}), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.warnings).toEqual(expect.arrayContaining([
      { path: 'giverNpc', kind: 'villager', missing: '없는NPC' },
      { path: 'transitions[0].actions[0].itemId', kind: 'item', missing: '없는item' },
    ]));
    expect(mockQuest.save).toHaveBeenCalled(); // 저장 자체는 성공
  });
});
