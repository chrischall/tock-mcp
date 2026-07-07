import { describe, it, expect } from 'vitest';
import {
  encode,
  decode,
  asString,
  asMessage,
  field,
  type PbField,
} from '../src/protobuf.js';

describe('protobuf codec', () => {
  it('round-trips varints (incl. multi-byte)', () => {
    const msg: PbField[] = [
      { field: 1, value: 2 },
      { field: 3, value: 202361 }, // multi-byte varint
      { field: 6, value: 0 },
    ];
    const decoded = decode(encode(msg));
    expect(decoded.map((f) => [f.field, Number(f.value as bigint)])).toEqual([
      [1, 2],
      [3, 202361],
      [6, 0],
    ]);
  });

  it('round-trips strings as length-delimited fields', () => {
    const decoded = decode(encode([{ field: 2, value: '2026-07-15T14:30' }]));
    expect(decoded[0].wireType).toBe(2);
    expect(asString(decoded[0].value)).toBe('2026-07-15T14:30');
  });

  it('round-trips nested messages (the lock message shape)', () => {
    // 60051 { 1: partySize, 2: datetime, 3: experienceId, 6: 0 }
    const lock: PbField[] = [
      {
        field: 60051,
        value: [
          { field: 1, value: 2 },
          { field: 2, value: '2026-07-15T14:30' },
          { field: 3, value: 202361 },
          { field: 6, value: 0 },
        ],
      },
    ];
    const bytes = encode(lock);
    const top = decode(bytes);
    expect(top).toHaveLength(1);
    expect(top[0].field).toBe(60051);
    const inner = asMessage(top[0].value);
    expect(Number(field(inner, 1)!.value as bigint)).toBe(2);
    expect(asString(field(inner, 2)!.value)).toBe('2026-07-15T14:30');
    expect(Number(field(inner, 3)!.value as bigint)).toBe(202361);
    // The captured lock request was 30 bytes — sanity that our encoding is the
    // same compact shape (tag+len overhead + a 16-char datetime).
    expect(bytes.length).toBe(30);
  });

  it('decodes fixed32/fixed64 as raw bytes without choking', () => {
    // manually craft: field 11, wire type 5 (fixed32), 4 bytes
    const raw = Uint8Array.from([(11 << 3) | 5, 1, 2, 3, 4]);
    const decoded = decode(raw);
    expect(decoded[0].field).toBe(11);
    expect(decoded[0].wireType).toBe(5);
    expect(decoded[0].value).toEqual(Uint8Array.from([1, 2, 3, 4]));
  });

  it('throws on a truncated message', () => {
    expect(() => decode(Uint8Array.from([(2 << 3) | 2, 10, 1, 2]))).toThrow(/truncated/);
  });

  it('encodes big field numbers (60020/60051) correctly', () => {
    const decoded = decode(encode([{ field: 60020, value: 1 }]));
    expect(decoded[0].field).toBe(60020);
  });

  it('encodes field numbers ≥ 2^28 without int32 tag overflow', () => {
    // `num << 3` overflows a signed int32 for field numbers ≥ 2^28 (2^28 << 3
    // wraps to a negative tag, which encodeVarint rejects). The tag must be
    // computed in BigInt space. Round-trip both wire types.
    const bigNum = 2 ** 28; // 268435456
    const varintDecoded = decode(encode([{ field: bigNum, value: 7 }]));
    expect(varintDecoded[0].field).toBe(bigNum);
    expect(varintDecoded[0].wireType).toBe(0);
    expect(Number(varintDecoded[0].value as bigint)).toBe(7);

    const strDecoded = decode(encode([{ field: bigNum, value: 'hi' }]));
    expect(strDecoded[0].field).toBe(bigNum);
    expect(strDecoded[0].wireType).toBe(2);
    expect(asString(strDecoded[0].value)).toBe('hi');
  });
});
