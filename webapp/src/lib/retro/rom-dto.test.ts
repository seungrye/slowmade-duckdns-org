import { describe, it, expect } from 'vitest';
import { activePatch, isRomId, livePatches, toRomDto, type LeanRom } from './rom-dto';

const patch = (id: string, over: Record<string, unknown> = {}) => ({
  _id: id, name: `${id}.ips`, format: 'ips', size: 100, objectKey: `k/${id}`, ...over,
});

const baseRom: LeanRom = {
  _id: '653f1a2b3c4d5e6f70819202',
  title: '내 롬',
  platform: 'snes',
  size: 2048,
  createdAt: new Date(0),
};

describe('retro/rom-dto', () => {
  describe('isRomId', () => {
    it('24 자리 16 진수만 통과한다', () => {
      expect(isRomId('653f1a2b3c4d5e6f70819202')).toBe(true);
      expect(isRomId('nope')).toBe(false);
      expect(isRomId('653f1a2b3c4d5e6f7081920')).toBe(false); // 23 자리
    });
  });

  describe('activePatch — 롬당 하나 (#116)', () => {
    it('패치가 없으면 undefined', () => {
      expect(activePatch({})).toBeUndefined();
      expect(activePatch({ patches: [] })).toBeUndefined();
    });

    it('지운 패치는 세지 않는다', () => {
      expect(activePatch({ patches: [patch('a', { isDeleted: true })] })).toBeUndefined();
    });

    it('살아 있는 게 여럿이면 **마지막**(가장 최근에 올린 것)을 쓴다', () => {
      const got = activePatch({ patches: [patch('old'), patch('new')] });
      expect(got?.id).toBe('new');
    });

    it('지운 것 사이에서도 살아 있는 마지막을 고른다', () => {
      const got = activePatch({
        patches: [patch('a', { isDeleted: true }), patch('b'), patch('c', { isDeleted: true })],
      });
      expect(got?.id).toBe('b');
    });

    it('오브젝트 키는 싣지 않는다', () => {
      const got = activePatch({ patches: [patch('a')] });
      expect(JSON.stringify(got)).not.toContain('objectKey');
      expect(got).toEqual({ id: 'a', name: 'a.ips', format: 'ips', size: 100 });
    });
  });

  describe('livePatches', () => {
    it('지우지 않은 것만 준다', () => {
      const got = livePatches({ patches: [patch('a'), patch('b', { isDeleted: true })] });
      expect(got.map((p) => p.id)).toEqual(['a']);
    });
  });

  describe('toRomDto', () => {
    it('패치·적용여부·세이브 유무를 함께 싣는다', () => {
      const dto = toRomDto({ ...baseRom, patches: [patch('a')], patchEnabled: true }, { hasSave: true });
      expect(dto.patch?.id).toBe('a');
      expect(dto.patchEnabled).toBe(true);
      expect(dto.hasSave).toBe(true);
    });

    it('patchEnabled 가 없던 옛 문서는 켜진 것으로 본다', () => {
      expect(toRomDto(baseRom).patchEnabled).toBe(true);
    });

    it('꺼 둔 것은 꺼진 채로', () => {
      expect(toRomDto({ ...baseRom, patchEnabled: false }).patchEnabled).toBe(false);
    });

    it('세이브 정보를 안 주면 false', () => {
      expect(toRomDto(baseRom).hasSave).toBe(false);
    });

    it('오브젝트 키는 어디에도 없다', () => {
      const dto = toRomDto({ ...baseRom, patches: [patch('a')] }, { hasSave: true });
      expect(JSON.stringify(dto)).not.toContain('objectKey');
      expect(JSON.stringify(dto)).not.toContain('k/a');
    });
  });
});
