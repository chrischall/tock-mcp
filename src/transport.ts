// Transport-agnostic interface for the bridge that relays exploretock.com
// fetches through the user's real, signed-in browser tab.
//
// The only implementation is src/transport-fetchproxy.ts — a thin adapter
// over @fetchproxy/server's FetchproxyServer (127.0.0.1:37149 WebSocket,
// dialed by the fetchproxy browser extension). TockClient (src/client.ts)
// accepts any TockTransport; error mapping (non-2xx, Cloudflare challenge,
// sign-in page) lives on the client so every implementation only has to
// round-trip the request and return a {status, body, url} triple.

export interface FetchInit {
  /** Path-and-query relative to https://www.exploretock.com, e.g.
   *  `/city/chicago` or `/alinea/search?date=2026-07-10&size=2`. */
  path: string;
  method: 'GET' | 'POST' | 'DELETE';
  headers?: Record<string, string>;
  /** Serialized request body. Omitted for GETs. */
  body?: string;
}

export interface FetchResult {
  status: number;
  /** Response body as a string. Empty string for 204. */
  body: string;
  /** Final URL after redirects. Used for sign-in-page detection. */
  url: string;
}

export interface TockTransport {
  /** Bring the transport up (start listening on the port). Idempotent. */
  start(): Promise<void>;
  /** Tear the transport down. Idempotent. */
  close(): Promise<void>;
  /** Round-trip one request through the bridge. Resolves to a result triple
   *  even for non-2xx statuses — the client maps HTTP-level outcomes. */
  fetch(init: FetchInit): Promise<FetchResult>;
}
