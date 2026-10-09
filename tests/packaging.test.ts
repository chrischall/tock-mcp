import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = JSON.parse(
  readFileSync(resolve(root, '.claude-plugin/plugin.json'), 'utf8'),
) as Record<string, unknown>;

describe('plugin.json packaging', () => {
  it('declares its MCP config under mcpServers, the key Claude Code reads', () => {
    expect(plugin).not.toHaveProperty('mcp');
    expect(typeof plugin.mcpServers).toBe('string');
  });

  it('points mcpServers at a file that exists', () => {
    expect(existsSync(resolve(root, plugin.mcpServers as string))).toBe(true);
  });
});
