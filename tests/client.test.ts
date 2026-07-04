import { describe, it, expect } from 'vitest';
import { TockClient, HttpError, SessionNotAuthenticatedError } from '../src/client.js';
import { McpToolError } from '@chrischall/mcp-utils';
import type { FetchInit, FetchResult, TockTransport } from '../src/transport.js';

class StubTransport implements TockTransport {
  constructor(private readonly result: FetchResult) {}
  lastInit?: FetchInit;
  async start(): Promise<void> {}
  async close(): Promise<void> {}
  async fetch(init: FetchInit): Promise<FetchResult> {
    this.lastInit = init;
    return this.result;
  }
}

const ok = (body: string, url = 'https://www.exploretock.com/x'): FetchResult => ({
  status: 200,
  body,
  url,
});

describe('TockClient slice extraction', () => {
  it('fetchSlice returns one named top-level slice', async () => {
    const html = `<script>window.$REDUX_STATE = {"app":{"n":1},"calendar":{"c":2}};</script>`;
    const client = new TockClient({ transport: new StubTransport(ok(html)) });
    await expect(client.fetchSlice('/city/chicago', 'app')).resolves.toEqual({
      n: 1,
    });
  });

  it('fetchSlices extracts several slices from one fetch', async () => {
    const html = `window.$REDUX_STATE = {"app":{"n":1},"calendar":{"c":2}};`;
    const t = new StubTransport(ok(html));
    const client = new TockClient({ transport: t });
    await expect(
      client.fetchSlices('/alinea', ['app', 'calendar'] as const)
    ).resolves.toEqual({ app: { n: 1 }, calendar: { c: 2 } });
  });

  it('issues a GET for the requested path', async () => {
    const t = new StubTransport(ok(`window.$REDUX_STATE = {"app":{}}`));
    const client = new TockClient({ transport: t });
    await client.fetchHtml('/alinea');
    expect(t.lastInit).toEqual({ path: '/alinea', method: 'GET' });
  });
});

describe('TockClient error mapping', () => {
  it('throws HttpError with the status on a plain non-2xx', async () => {
    const client = new TockClient({
      transport: new StubTransport({ status: 404, body: 'not found', url: 'x' }),
    });
    await expect(client.fetchHtml('/nope')).rejects.toMatchObject({
      status: 404,
    });
    await expect(client.fetchHtml('/nope')).rejects.toBeInstanceOf(HttpError);
  });

  it('maps a Cloudflare challenge (even on a 200) to an actionable McpToolError', async () => {
    const body = `<!DOCTYPE html><head><title>Just a moment...</title></head>`;
    const client = new TockClient({ transport: new StubTransport(ok(body)) });
    await expect(client.fetchHtml('/city/chicago')).rejects.toBeInstanceOf(
      McpToolError
    );
  });

  it('maps a 403 challenge body to the challenge error, not a bare HttpError', async () => {
    const body = `<html><script>window._cf_chl_opt={};</script></html>`;
    const client = new TockClient({
      transport: new StubTransport({ status: 403, body, url: 'x' }),
    });
    await expect(client.fetchHtml('/city/chicago')).rejects.toBeInstanceOf(
      McpToolError
    );
  });

  it('maps a sign-in redirect to SessionNotAuthenticatedError', async () => {
    const client = new TockClient({
      transport: new StubTransport(
        ok('<html>login</html>', 'https://www.exploretock.com/login?next=/reservations')
      ),
    });
    await expect(client.fetchHtml('/reservations')).rejects.toBeInstanceOf(
      SessionNotAuthenticatedError
    );
  });
});
