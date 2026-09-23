import { describe, it, expect, vi } from 'vitest';
import { FetchproxyTransport } from '../src/transport-fetchproxy.js';

describe('FetchproxyTransport.fetch', () => {
  it('forwards retryOnTimeout to the fetchproxy server (read-only POST)', async () => {
    const t = new FetchproxyTransport({ port: 0, version: '0.0.0' });
    const request = vi
      .spyOn(t.bridge.server, 'request')
      .mockResolvedValue({ status: 200, body: '{}', url: 'u' } as never);
    await t.fetch({ path: '/api/graphql/X', method: 'POST', body: '{}', retryOnTimeout: true });
    expect(request).toHaveBeenCalledWith('POST', '/api/graphql/X', expect.objectContaining({ retryOnTimeout: true }));
  });

  it('does not opt a request into retryOnTimeout unless asked', async () => {
    const t = new FetchproxyTransport({ port: 0, version: '0.0.0' });
    const request = vi
      .spyOn(t.bridge.server, 'request')
      .mockResolvedValue({ status: 200, body: '{}', url: 'u' } as never);
    await t.fetch({ path: '/x', method: 'POST', body: '{}' });
    expect(request.mock.calls[0][2]).not.toHaveProperty('retryOnTimeout');
  });
});
