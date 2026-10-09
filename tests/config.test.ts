import { describe, it, expect, vi } from 'vitest';
import { resolveWsPort, buildBanner } from '../src/config.js';
import { DEFAULT_PORT } from '../src/transport-fetchproxy.js';

describe('resolveWsPort', () => {
  it('returns undefined (use the shared default) when TOCK_WS_PORT is unset', () => {
    const warn = vi.fn();
    expect(resolveWsPort({}, warn)).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('treats a blank / placeholder value as unset without warning', () => {
    const warn = vi.fn();
    expect(resolveWsPort({ TOCK_WS_PORT: '   ' }, warn)).toBeUndefined();
    expect(resolveWsPort({ TOCK_WS_PORT: '${TOCK_WS_PORT}' }, warn)).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('parses a valid port', () => {
    const warn = vi.fn();
    expect(resolveWsPort({ TOCK_WS_PORT: '40000' }, warn)).toBe(40000);
    expect(resolveWsPort({ TOCK_WS_PORT: '1' }, warn)).toBe(1);
    expect(resolveWsPort({ TOCK_WS_PORT: '65535' }, warn)).toBe(65535);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each(['abc', '12abc', '1.5', '0', '65536', '-1'])(
    'rejects %j with a warning and falls back to the default',
    (raw) => {
      const warn = vi.fn();
      expect(resolveWsPort({ TOCK_WS_PORT: raw }, warn)).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('TOCK_WS_PORT');
      expect(warn.mock.calls[0][0]).toContain(String(DEFAULT_PORT));
    }
  );

  it('warns on stderr by default', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(resolveWsPort({ TOCK_WS_PORT: 'nope' })).toBeUndefined();
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('buildBanner', () => {
  it('interpolates the effective port', () => {
    expect(buildBanner('1.2.3', 40000)).toContain('127.0.0.1:40000');
    expect(buildBanner('1.2.3', 40000)).not.toContain('37149');
  });

  it('falls back to the shared default port', () => {
    expect(buildBanner('1.2.3', undefined)).toContain(`127.0.0.1:${DEFAULT_PORT}`);
    expect(buildBanner('1.2.3', undefined)).toContain('v1.2.3');
  });
});
