/**
 * Minimal protobuf wire-format codec — just enough to build and read Tock's
 * ticket messages (see docs/TOCK-API.md). Handles the two wire types Tock uses:
 *   0 = varint          (ints / enums)
 *   2 = length-delimited (utf-8 strings + nested messages)
 * fixed32/fixed64 (wire types 5/1) are decoded as raw bytes and skipped on
 * encode — Tock's request messages don't need us to emit them.
 *
 * Messages are plain field lists so callers can mirror the captured shapes
 * field-for-field without a generated schema.
 */

export type WireType = 0 | 1 | 2 | 5;

/** A value to encode: number/bigint → varint; string → utf-8 bytes; Uint8Array
 *  → raw bytes; PbField[] → nested message. */
export type PbEncodable = number | bigint | string | Uint8Array | PbField[];

export interface PbField {
  field: number;
  value: PbEncodable;
}

/** A decoded field. `value` is a bigint (varint), Uint8Array (length-delimited
 *  or fixed), whose meaning the caller interprets. */
export interface PbDecoded {
  field: number;
  wireType: WireType;
  value: bigint | Uint8Array;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: false });

function encodeVarint(value: bigint, out: number[]): void {
  let v = value;
  if (v < 0n) throw new Error('varint cannot be negative');
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    out.push(byte);
  } while (v > 0n);
}

function fieldBytes(field: PbField): Uint8Array {
  const { field: num, value } = field;
  const out: number[] = [];
  if (typeof value === 'number' || typeof value === 'bigint') {
    // wire type 0
    encodeVarint(BigInt(num << 3), out);
    encodeVarint(BigInt(value), out);
  } else {
    // wire type 2 — string / bytes / nested message
    const bytes =
      typeof value === 'string'
        ? textEncoder.encode(value)
        : value instanceof Uint8Array
          ? value
          : encode(value); // nested message
    encodeVarint(BigInt((num << 3) | 2), out);
    encodeVarint(BigInt(bytes.length), out);
    out.push(...bytes);
  }
  return Uint8Array.from(out);
}

/** Encode a message (ordered field list) to protobuf bytes. */
export function encode(fields: PbField[]): Uint8Array {
  const chunks = fields.map(fieldBytes);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/** Decode protobuf bytes into a flat field list. Throws on truncation. */
export function decode(bytes: Uint8Array): PbDecoded[] {
  const out: PbDecoded[] = [];
  let i = 0;
  const varint = (): bigint => {
    let shift = 0n;
    let result = 0n;
    for (;;) {
      if (i >= bytes.length) throw new Error('protobuf: truncated varint');
      const b = bytes[i++];
      result |= BigInt(b & 0x7f) << shift;
      if (!(b & 0x80)) break;
      shift += 7n;
    }
    return result;
  };
  while (i < bytes.length) {
    const key = Number(varint());
    const field = key >>> 3;
    const wireType = (key & 7) as WireType;
    if (wireType === 0) {
      out.push({ field, wireType, value: varint() });
    } else if (wireType === 2) {
      const len = Number(varint());
      if (i + len > bytes.length) throw new Error('protobuf: truncated bytes');
      out.push({ field, wireType, value: bytes.slice(i, i + len) });
      i += len;
    } else if (wireType === 1) {
      if (i + 8 > bytes.length) throw new Error('protobuf: truncated fixed64');
      out.push({ field, wireType, value: bytes.slice(i, i + 8) });
      i += 8;
    } else if (wireType === 5) {
      if (i + 4 > bytes.length) throw new Error('protobuf: truncated fixed32');
      out.push({ field, wireType, value: bytes.slice(i, i + 4) });
      i += 4;
    } else {
      throw new Error(`protobuf: unsupported wire type ${wireType}`);
    }
  }
  return out;
}

/** Decode a length-delimited field's bytes as a utf-8 string. */
export function asString(value: bigint | Uint8Array): string {
  if (value instanceof Uint8Array) return textDecoder.decode(value);
  throw new Error('asString: not a length-delimited field');
}

/** Decode a length-delimited field's bytes as a nested message. */
export function asMessage(value: bigint | Uint8Array): PbDecoded[] {
  if (value instanceof Uint8Array) return decode(value);
  throw new Error('asMessage: not a length-delimited field');
}

/** First field with the given number, or undefined. */
export function field(fields: PbDecoded[], num: number): PbDecoded | undefined {
  return fields.find((f) => f.field === num);
}
