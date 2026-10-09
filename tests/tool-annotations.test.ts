import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

/**
 * Fleet annotation meta-test, read off the WIRE (tools/list from the real
 * built bundle), never a hand-kept list — so the healthcheck registered in
 * src/index.ts is covered too. `destructiveHint` defaults to TRUE whenever
 * `readOnlyHint` is false, so a write that forgets to declare it publishes as
 * destructive and nothing else fails; a missing `openWorldHint` defaults to
 * true, which is only right by accident.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE = join(ROOT, 'dist', 'bundle.js');

interface Ann {
  readOnlyHint?: unknown;
  destructiveHint?: unknown;
  openWorldHint?: unknown;
}

let tools: { name: string; annotations?: Ann }[] = [];

beforeAll(async () => {
  if (!existsSync(BUNDLE)) execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
  const client = new Client({ name: 'tool-annotations-test', version: '1.0.0' });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [BUNDLE],
      // Non-default port so this never fights a real 37149 bridge (the bridge
      // binds lazily on first request anyway).
      env: { ...process.env, TOCK_WS_PORT: '37198' } as Record<string, string>,
      stderr: 'ignore',
    }),
  );
  tools = (await client.listTools()).tools as typeof tools;
  await client.close();
}, 120_000);

describe('tool annotations', () => {
  it('covers the full surface (guards against a registrar being dropped)', () => {
    expect(tools).toHaveLength(8);
  });

  it('sets an explicit boolean readOnlyHint on every tool', () => {
    const missing = tools
      .filter((t) => typeof t.annotations?.readOnlyHint !== 'boolean')
      .map((t) => t.name);
    expect(missing).toEqual([]);
  });

  it('sets an explicit boolean destructiveHint on every write', () => {
    const undeclared = tools
      .filter(
        (t) =>
          t.annotations?.readOnlyHint !== true &&
          typeof t.annotations?.destructiveHint !== 'boolean',
      )
      .map((t) => t.name);
    expect(undeclared).toEqual([]);
  });

  it('never lets a read claim to be destructive', () => {
    const contradictory = tools
      .filter(
        (t) => t.annotations?.readOnlyHint === true && t.annotations?.destructiveHint === true,
      )
      .map((t) => t.name);
    expect(contradictory).toEqual([]);
  });

  it('sets an explicit boolean openWorldHint on every tool', () => {
    const missing = tools
      .filter((t) => typeof t.annotations?.openWorldHint !== 'boolean')
      .map((t) => t.name);
    expect(missing).toEqual([]);
  });

  it('is entirely read-only and open-world (every call rides the bridge to exploretock.com)', () => {
    // Writes are deliberately not shippable (CLAUDE.md), so a write appearing
    // here is a design change that needs its own annotation decision.
    expect(tools.filter((t) => t.annotations?.readOnlyHint !== true).map((t) => t.name)).toEqual([]);
    expect(tools.filter((t) => t.annotations?.openWorldHint !== true).map((t) => t.name)).toEqual([]);
  });
});

describe('manifest.json tools[]', () => {
  it('lists exactly the served tool names, in both directions', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')) as {
      tools: { name: string }[];
    };
    expect(manifest.tools.map((t) => t.name).sort()).toEqual(tools.map((t) => t.name).sort());
  });
});

describe('declared env', () => {
  // TOCK_WS_PORT is read by src/config.ts; FETCHPROXY_WS_HOST and
  // FETCHPROXY_IDENTITY_DIR by the bundled @fetchproxy/server, because tock
  // never passes `host` / `identityDir`. All three are optional.
  const KEYS = ['TOCK_WS_PORT', 'FETCHPROXY_WS_HOST', 'FETCHPROXY_IDENTITY_DIR'];

  it('wires each optional key through manifest.json user_config', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')) as {
      server: { mcp_config: { env?: Record<string, string> } };
      user_config?: Record<string, { required?: boolean }>;
    };
    const env = manifest.server.mcp_config.env ?? {};
    expect(Object.keys(env).sort()).toEqual([...KEYS].sort());
    for (const k of KEYS) {
      const ref = /^\$\{user_config\.([^}]+)\}$/.exec(env[k])?.[1];
      expect(ref, k).toBeDefined();
      expect(manifest.user_config?.[ref!]?.required, k).toBe(false);
    }
  });

  it('declares each key as optional in server.json', () => {
    const server = JSON.parse(readFileSync(join(ROOT, 'server.json'), 'utf8')) as {
      packages: { environmentVariables?: { name: string; isRequired?: boolean }[] }[];
    };
    const vars = server.packages[0].environmentVariables ?? [];
    expect(vars.map((v) => v.name).sort()).toEqual([...KEYS].sort());
    expect(vars.filter((v) => v.isRequired !== false).map((v) => v.name)).toEqual([]);
  });
});
