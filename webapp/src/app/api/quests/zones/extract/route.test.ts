import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/quest', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/zone', () => ({ default: { findOne: vi.fn(), create: vi.fn() } }));

import { POST } from './route';
import { collectOpenPortals, collectFromQuest } from '@/lib/zone-extract';
import Quest from '@/models/quest';
import Zone from '@/models/zone';
import type { Action, QuestTransition } from '@/types/quest';

describe('collectOpenPortals — 액션 스캔', () => {
  it('단일 OpenPortal 수집', () => {
    const actions: Action[] = [
      { type: 'OpenPortal', zone: 'cave', generator: 'bsp' },
    ];
    expect(collectOpenPortals(actions)).toEqual([{ zone: 'cave', generator: 'bsp' }]);
  });

  it('여러 OpenPortal 수집', () => {
    const actions: Action[] = [
      { type: 'OpenPortal', zone: 'cave', generator: 'bsp' },
      { type: 'Log', text: 'x' },
      { type: 'OpenPortal', zone: 'glade', generator: 'forest' },
    ];
    expect(collectOpenPortals(actions)).toEqual([
      { zone: 'cave', generator: 'bsp' },
      { zone: 'glade', generator: 'forest' },
    ]);
  });

  it('OpenPortal 이 없는 액션은 무시', () => {
    const actions: Action[] = [
      { type: 'Log', text: 'x' },
      { type: 'GiveItem', itemId: 'sword' },
    ];
    expect(collectOpenPortals(actions)).toEqual([]);
  });
});

describe('collectFromQuest — transitions 의 actions 스캔', () => {
  it('여러 transition 의 actions 를 스캔', () => {
    const transitions: QuestTransition[] = [
      { from: 'a', trigger: 'Interact', actions: [{ type: 'OpenPortal', zone: 'cave', generator: 'bsp' }], to: 'b' },
      { from: 'b', trigger: 'Auto', actions: [{ type: 'OpenPortal', zone: 'glade', generator: 'forest' }], to: 'c' },
    ];
    expect(collectFromQuest({ transitions })).toEqual([
      { zone: 'cave', generator: 'bsp' },
      { zone: 'glade', generator: 'forest' },
    ]);
  });

  it('transitions 가 없으면 빈 배열', () => {
    expect(collectFromQuest({})).toEqual([]);
  });
});

describe('POST /api/quests/zones/extract', () => {
  beforeEach(() => vi.clearAllMocks());

  function questWith(zone: string, generator: string) {
    const transitions: QuestTransition[] = [
      { from: 'a', trigger: 'Interact', actions: [{ type: 'OpenPortal', zone, generator }], to: 'b' },
    ];
    return { transitions };
  }

  it('카탈로그에 없는 zone 은 created 카운트 + 생성', async () => {
    (Quest.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([questWith('cave', 'cellular_automata')]),
    });
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Zone.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ created: 1, skipped: 0, conflicts: [] });
    expect(Zone.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'cave', generator: 'cellular_automata',
    }));
  });

  it('카탈로그 존재 + generator 일치 → skipped', async () => {
    (Quest.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([questWith('cave', 'bsp')]),
    });
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({ name: 'cave', generator: 'bsp' });

    const res = await POST();
    const body = await res.json();
    expect(body.data).toEqual({ created: 0, skipped: 1, conflicts: [] });
    expect(Zone.create).not.toHaveBeenCalled();
  });

  it('카탈로그 존재 + generator 불일치 → conflict (변경 안 함)', async () => {
    (Quest.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([questWith('cave', 'bsp_indoor')]),
    });
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({ name: 'cave', generator: 'bsp' });

    const res = await POST();
    const body = await res.json();
    expect(body.data).toEqual({
      created: 0, skipped: 0,
      conflicts: [{ name: 'cave', catalogGenerator: 'bsp', foundGenerator: 'bsp_indoor' }],
    });
    expect(Zone.create).not.toHaveBeenCalled();
  });

  it('동일 (zone, generator) 가 여러 quest 에 등장해도 한 번만 처리', async () => {
    (Quest.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([questWith('cave', 'bsp'), questWith('cave', 'bsp')]),
    });
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Zone.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await POST();
    const body = await res.json();
    expect(body.data.created).toBe(1);
    expect(Zone.create).toHaveBeenCalledTimes(1);
  });
});
