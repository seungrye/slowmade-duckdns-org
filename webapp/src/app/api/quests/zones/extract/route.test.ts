import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ connectToDB: vi.fn() }));
vi.mock('@/models/quest', () => ({ default: { find: vi.fn() } }));
vi.mock('@/models/zone', () => ({ default: { findOne: vi.fn(), create: vi.fn() } }));

import { POST } from './route';
import { collectOpenPortals, collectFromQuest } from '@/lib/zone-extract';
import Quest from '@/models/quest';
import Zone from '@/models/zone';
import type { Action, QuestPhaseDef } from '@/types/quest';

describe('collectOpenPortals — 재귀 스캔', () => {
  it('단일 OpenPortal 수집', () => {
    const actions: Action[] = [
      { type: 'OpenPortal', zone: 'cave', generator: 'bsp' },
    ];
    expect(collectOpenPortals(actions)).toEqual([{ zone: 'cave', generator: 'bsp' }]);
  });

  it('Branch ifTrue/ifFalse 내부 OpenPortal 수집', () => {
    const actions: Action[] = [
      {
        type: 'Branch',
        condition: { type: 'Always' },
        ifTrue: [{ type: 'OpenPortal', zone: 'cave', generator: 'bsp' }],
        ifFalse: [{ type: 'OpenPortal', zone: 'glade', generator: 'forest' }],
      },
    ];
    expect(collectOpenPortals(actions)).toEqual([
      { zone: 'cave', generator: 'bsp' },
      { zone: 'glade', generator: 'forest' },
    ]);
  });

  it('중첩 Branch 재귀', () => {
    const inner: Action = {
      type: 'Branch',
      condition: { type: 'Always' },
      ifTrue: [{ type: 'OpenPortal', zone: 'inner', generator: 'bsp' }],
      ifFalse: [],
    };
    const actions: Action[] = [
      {
        type: 'Branch',
        condition: { type: 'Always' },
        ifTrue: [inner],
        ifFalse: [],
      },
    ];
    expect(collectOpenPortals(actions)).toEqual([{ zone: 'inner', generator: 'bsp' }]);
  });

  it('OpenPortal 이 없는 액션은 무시', () => {
    const actions: Action[] = [
      { type: 'Log', text: 'x' },
      { type: 'GiveItem', itemId: 'sword' },
    ];
    expect(collectOpenPortals(actions)).toEqual([]);
  });
});

describe('collectFromQuest — phase 의 on_interact + auto_advance.actions', () => {
  it('on_interact 와 auto_advance.actions 둘 다 스캔', () => {
    const phase: QuestPhaseDef = {
      dialog: [],
      on_interact: [{ type: 'OpenPortal', zone: 'cave', generator: 'bsp' }],
      auto_advance: [{
        condition: { type: 'Always' },
        nextPhase: 'next',
        actions: [{ type: 'OpenPortal', zone: 'glade', generator: 'forest' }],
      }],
      objective: null,
    };
    const portals = collectFromQuest({ phases: { p: phase } });
    expect(portals).toEqual([
      { zone: 'cave', generator: 'bsp' },
      { zone: 'glade', generator: 'forest' },
    ]);
  });

  it('Map 형태 phases 도 처리', () => {
    const phase: QuestPhaseDef = {
      dialog: [], on_interact: [{ type: 'OpenPortal', zone: 'z', generator: 'g' }],
      auto_advance: [], objective: null,
    };
    const portals = collectFromQuest({ phases: new Map([['p', phase]]) });
    expect(portals).toEqual([{ zone: 'z', generator: 'g' }]);
  });
});

describe('POST /api/quests/zones/extract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('카탈로그에 없는 zone 은 created 카운트 + 생성', async () => {
    const phase: QuestPhaseDef = {
      dialog: [],
      on_interact: [{ type: 'OpenPortal', zone: 'cave', generator: 'cellular_automata' }],
      auto_advance: [], objective: null,
    };
    (Quest.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ phases: { p: phase } }]),
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
    const phase: QuestPhaseDef = {
      dialog: [],
      on_interact: [{ type: 'OpenPortal', zone: 'cave', generator: 'bsp' }],
      auto_advance: [], objective: null,
    };
    (Quest.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ phases: { p: phase } }]),
    });
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      name: 'cave', generator: 'bsp',
    });

    const res = await POST();
    const body = await res.json();
    expect(body.data).toEqual({ created: 0, skipped: 1, conflicts: [] });
    expect(Zone.create).not.toHaveBeenCalled();
  });

  it('카탈로그 존재 + generator 불일치 → conflict (변경 안 함)', async () => {
    const phase: QuestPhaseDef = {
      dialog: [],
      on_interact: [{ type: 'OpenPortal', zone: 'cave', generator: 'bsp_indoor' }],
      auto_advance: [], objective: null,
    };
    (Quest.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ phases: { p: phase } }]),
    });
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      name: 'cave', generator: 'bsp',
    });

    const res = await POST();
    const body = await res.json();
    expect(body.data).toEqual({
      created: 0, skipped: 0,
      conflicts: [{ name: 'cave', catalogGenerator: 'bsp', foundGenerator: 'bsp_indoor' }],
    });
    expect(Zone.create).not.toHaveBeenCalled();
  });

  it('동일 (zone, generator) 가 여러 quest 에 등장해도 한 번만 처리', async () => {
    const phase: QuestPhaseDef = {
      dialog: [],
      on_interact: [{ type: 'OpenPortal', zone: 'cave', generator: 'bsp' }],
      auto_advance: [], objective: null,
    };
    (Quest.find as ReturnType<typeof vi.fn>).mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        { phases: { p: phase } },
        { phases: { q: phase } },
      ]),
    });
    (Zone.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (Zone.create as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const res = await POST();
    const body = await res.json();
    expect(body.data.created).toBe(1);
    expect(Zone.create).toHaveBeenCalledTimes(1);
  });
});
