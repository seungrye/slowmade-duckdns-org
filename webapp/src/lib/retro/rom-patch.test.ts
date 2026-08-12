// 배포되는 그 파일을 그대로 불러 검증한다 (#112).
// player.html 이 import 하는 파일과 여기서 테스트하는 파일이 **같은 하나**여야
// "테스트는 통과하는데 브라우저에서는 다르게 동작" 하는 일이 없다.
import { describe, it, expect } from 'vitest';
import {
  applyRomPatch,
  detectPatchFormat,
  crc32,
  HEADER_SIZE,
  hasCopierHeader,
} from '../../../public/games/retro/rom-patch.js';

const enc = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const u8 = (...parts: (number | number[])[]) => new Uint8Array(parts.flat());

// ── IPS 만들기 도우미 ────────────────────────────────────────────────────────
/** 일반 레코드: offset(3) size(2) data */
function ipsRecord(offset: number, data: number[]): number[] {
  return [offset >> 16 & 0xff, offset >> 8 & 0xff, offset & 0xff, data.length >> 8 & 0xff, data.length & 0xff, ...data];
}
/** RLE 레코드: offset(3) 0x0000 count(2) value(1) */
function ipsRle(offset: number, count: number, value: number): number[] {
  return [offset >> 16 & 0xff, offset >> 8 & 0xff, offset & 0xff, 0, 0, count >> 8 & 0xff, count & 0xff, value];
}
function ips(...records: number[][]): Uint8Array {
  return u8(enc('PATCH'), ...records, enc('EOF'));
}

describe('retro/rom-patch', () => {
  describe('detectPatchFormat — 매직으로 판별한다', () => {
    it.each([
      ['PATCH...', 'ips'],
      ['BPS1....', 'bps'],
      ['UPS1....', 'ups'],
    ])('%s → %s', (magic, expected) => {
      expect(detectPatchFormat(u8(enc(magic)))).toBe(expected);
    });

    it('모르는 형식은 null — 조용히 망가뜨리지 않는다', () => {
      expect(detectPatchFormat(u8(enc('XDELTA..')))).toBeNull();
      expect(detectPatchFormat(u8([1, 2]))).toBeNull();
      expect(detectPatchFormat(new Uint8Array(0))).toBeNull();
    });
  });

  describe('hasCopierHeader — SFC 512 바이트 헤더 감지', () => {
    it('512 나머지가 있으면 헤더로 본다', () => {
      expect(hasCopierHeader(new Uint8Array(1024 * 512 + 512))).toBe(true);
      expect(hasCopierHeader(new Uint8Array(1024 * 512))).toBe(false);
    });
  });

  describe('IPS', () => {
    it('일반 레코드를 덮어쓴다', () => {
      const rom = new Uint8Array([0, 0, 0, 0, 0, 0]);
      const out = applyRomPatch(rom, ips(ipsRecord(2, [0xaa, 0xbb])));
      expect(Array.from(out.rom)).toEqual([0, 0, 0xaa, 0xbb, 0, 0]);
      expect(out.format).toBe('ips');
    });

    it('RLE 레코드는 같은 값을 반복해 채운다', () => {
      const out = applyRomPatch(new Uint8Array(6), ips(ipsRle(1, 3, 0xff)));
      expect(Array.from(out.rom)).toEqual([0, 0xff, 0xff, 0xff, 0, 0]);
    });

    it('롬 끝을 넘는 레코드는 파일을 늘린다 — 번역 패치가 흔히 그렇게 한다', () => {
      const out = applyRomPatch(new Uint8Array(4), ips(ipsRecord(6, [1, 2])));
      expect(out.rom.length).toBe(8);
      expect(Array.from(out.rom.slice(4))).toEqual([0, 0, 1, 2]);
    });

    it('EOF 뒤의 truncate 확장(3바이트)을 존중한다', () => {
      const patch = u8(enc('PATCH'), ipsRecord(0, [9]), enc('EOF'), [0, 0, 2]);
      const out = applyRomPatch(new Uint8Array([0, 0, 0, 0, 0]), patch);
      expect(out.rom.length).toBe(2);
      expect(out.rom[0]).toBe(9);
    });

    it('원본을 건드리지 않는다', () => {
      const rom = new Uint8Array([1, 2, 3]);
      applyRomPatch(rom, ips(ipsRecord(0, [9])));
      expect(Array.from(rom)).toEqual([1, 2, 3]);
    });

    it('EOF 없이 끊긴 패치는 오류', () => {
      expect(() => applyRomPatch(new Uint8Array(4), u8(enc('PATCH'), [0, 0, 1, 0]))).toThrow();
    });

    describe('512 헤더 처리', () => {
      const body = () => {
        const b = new Uint8Array(1024);
        b[10] = 0x11;
        return b;
      };
      const withHeader = () => {
        const h = new Uint8Array(1024 + HEADER_SIZE);
        h.set(body(), HEADER_SIZE);
        return h;
      };

      it('stripHeader=true 면 헤더를 떼고 패치한 뒤 헤더 없이 돌려준다', () => {
        const out = applyRomPatch(withHeader(), ips(ipsRecord(10, [0x22])), { stripHeader: true });
        expect(out.rom.length).toBe(1024);
        expect(out.rom[10]).toBe(0x22);
        expect(out.headerStripped).toBe(true);
      });

      it('stripHeader=false 면 헤더를 포함한 오프셋으로 패치한다', () => {
        const out = applyRomPatch(withHeader(), ips(ipsRecord(10, [0x22])), { stripHeader: false });
        expect(out.rom.length).toBe(1024 + HEADER_SIZE);
        expect(out.rom[10]).toBe(0x22);
        // 본문의 같은 자리는 그대로 — 512 밀린 자리를 고쳤다는 뜻
        expect(out.rom[HEADER_SIZE + 10]).toBe(0x11);
      });
    });
  });

  describe('crc32', () => {
    it('알려진 값과 맞는다', () => {
      // "123456789" 의 CRC-32 는 0xCBF43926 (표준 검증 벡터)
      expect(crc32(u8(enc('123456789'))) >>> 0).toBe(0xcbf43926);
    });
  });

  describe('BPS', () => {
    // BPS: "BPS1" + varint(sourceSize,targetSize,metaSize) + 액션들 + CRC(source,target,patch)
    function varint(n: number): number[] {
      const out: number[] = [];
      let x = n;
      for (;;) {
        const b = x & 0x7f;
        x = Math.floor(x / 128) - 1;
        if (x < 0) { out.push(b | 0x80); break; }
        out.push(b);
      }
      return out;
    }
    function le32(n: number): number[] {
      return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
    }
    /** source 를 통째로 복사한 뒤 tail 바이트를 덧붙이는 최소 BPS. */
    function makeBps(source: Uint8Array, tail: number[]): Uint8Array {
      const target = u8(Array.from(source), tail);
      const actions = [
        // SourceRead: (length-1)<<2 | 0
        ...varint(((source.length - 1) << 2) | 0),
        // TargetRead: (length-1)<<2 | 1, 뒤에 데이터
        ...varint(((tail.length - 1) << 2) | 1), ...tail,
      ];
      const head = u8(enc('BPS1'), varint(source.length), varint(target.length), varint(0), actions);
      const withSrcTgt = u8(Array.from(head), le32(crc32(source) >>> 0), le32(crc32(target) >>> 0));
      return u8(Array.from(withSrcTgt), le32(crc32(withSrcTgt) >>> 0));
    }

    // 실제 SFC 롬처럼 1KB 배수로 만든다 — 헤더 감지 규칙(size % 1024 === 512)이 성립하는 크기.
    const source = (() => {
      const s = new Uint8Array(1024);
      for (let i = 0; i < s.length; i++) s[i] = i & 0xff;
      return s;
    })();

    it('적용하면 target 이 나온다', () => {
      const out = applyRomPatch(source, makeBps(source, [9, 9]));
      expect(out.rom.length).toBe(source.length + 2);
      expect(Array.from(out.rom.slice(-2))).toEqual([9, 9]);
      expect(out.format).toBe('bps');
    });

    it('다른 롬에 붙이면 CRC 로 잡아낸다 — IPS 와 달리 미리 막을 수 있다', () => {
      const wrong = new Uint8Array(1024);
      expect(() => applyRomPatch(wrong, makeBps(source, [1]))).toThrow(/맞지 않습니다|CRC/);
    });

    it('헤더 있는 롬이어도 CRC 로 맞는 해석을 자동으로 고른다', () => {
      const headered = new Uint8Array(HEADER_SIZE + source.length);
      headered.set(source, HEADER_SIZE);
      // stripHeader 를 지정하지 않아도 알아서 512 를 떼고 맞춘다.
      const out = applyRomPatch(headered, makeBps(source, [7]));
      expect(out.rom.length).toBe(source.length + 1);
      expect(out.rom[out.rom.length - 1]).toBe(7);
      expect(out.headerStripped).toBe(true);
    });

    it('헤더 없는 롬에는 떼지 않고 그대로 맞춘다', () => {
      const out = applyRomPatch(source, makeBps(source, [7]));
      expect(out.headerStripped).toBe(false);
    });
  });

  it('모르는 형식은 명확히 거절한다', () => {
    expect(() => applyRomPatch(new Uint8Array(4), u8(enc('XDELTA3')))).toThrow(/지원하지 않는/);
  });
});
