// Adapter that lets @fetchproxy/server's FetchproxyServer satisfy
// tock-mcp's TockTransport interface.
//
// mcp-utils' createFetchproxyTransport owns the FetchproxyServer
// construction + start/close lifecycle (the boilerplate ~12 sibling MCPs
// share). We keep the Tock-specific fetch() mapping (relative path → www
// subdomain → {status, body, url}) here since it's domain-specific.
//
// The fetchproxy fleet all binds the SAME concentrator port (37149): the
// browser extension dials that one port and servers host/peer-elect on it.
// A different port means the extension never connects, so DON'T change it.
import {
  createFetchproxyTransport,
  type FetchproxyTransport as FetchproxyTransportAdapter,
} from '@chrischall/mcp-utils/fetchproxy';
import type { FetchInit, FetchResult, TockTransport } from './transport.js';

/** Shared fetchproxy concentrator port — dialed by the browser extension.
 *  The whole fetchproxy fleet uses this one port; overriding it (TOCK_WS_PORT)
 *  is for local testing only. */
export const DEFAULT_PORT = 37_149;

export interface FetchproxyTransportOptions {
  port?: number;
  /** MCP server name announced to the extension. Defaults to 'tock-mcp'. */
  server?: string;
  /** MCP server version. Should match package.json + the banner in index.ts. */
  version: string;
}

export class FetchproxyTransport implements TockTransport {
  /** The mcp-utils adapter over @fetchproxy/server — exposes runProbe/status
   *  used by the healthcheck tool. */
  readonly bridge: FetchproxyTransportAdapter;
  private readonly inner: FetchproxyTransportAdapter;

  constructor(opts: FetchproxyTransportOptions) {
    this.inner = createFetchproxyTransport({
      port: opts.port ?? DEFAULT_PORT,
      serverName: opts.server ?? 'tock-mcp',
      version: opts.version,
      // Subdomains of exploretock.com (www.exploretock.com) match the
      // declared root automatically.
      domains: ['exploretock.com'],
    });
    this.bridge = this.inner;
  }

  start(): Promise<void> {
    return this.inner.start();
  }

  close(): Promise<void> {
    return this.inner.close();
  }

  async fetch(init: FetchInit): Promise<FetchResult> {
    // request() throws FetchproxyBridgeDownError on persistent SW eviction
    // (after the server's one-shot lazy-revive retry) and
    // FetchproxyTimeoutError on the per-request timeout — both subclasses of
    // FetchproxyProtocolError, so a caller catching the parent still matches.
    const response = await this.inner.server.request(init.method, init.path, {
      subdomain: 'www',
      headers: init.headers,
      body: init.body,
    });
    return { status: response.status, body: response.body, url: response.url };
  }
}
