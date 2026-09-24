import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const readJson = (p: string) => JSON.parse(readFileSync(resolve(here, p), 'utf8'));

// The fleet floor for @chrischall/mcp-utils is 2.6.0 (fleet-audit 2026-09-24,
// DEP-1). Guard both the declared range and the locked resolution so the
// straggler pin cannot silently come back.
const FLOOR: [number, number, number] = [2, 6, 0];
const parse = (v: string) => v.replace(/^[^\d]*/, '').split('.').map(Number) as [number, number, number];
const atLeast = (v: [number, number, number], f: [number, number, number]) =>
  v[0] !== f[0] ? v[0] > f[0] : v[1] !== f[1] ? v[1] > f[1] : v[2] >= f[2];

describe('@chrischall/mcp-utils floor', () => {
  it('package.json declares at least ^2.6.0', () => {
    const range: string = readJson('../package.json').dependencies['@chrischall/mcp-utils'];
    expect(atLeast(parse(range), FLOOR)).toBe(true);
  });

  it('package-lock.json resolves at least 2.6.0', () => {
    const lock = readJson('../package-lock.json');
    const version: string = lock.packages['node_modules/@chrischall/mcp-utils'].version;
    expect(atLeast(parse(version), FLOOR)).toBe(true);
  });
});
