// TockClient is the thin, tool-facing API over a TockTransport. Every read
// goes through fetchState() — GET an exploretock.com page through the user's
// signed-in browser tab, then extract its embedded window.$REDUX_STATE store.
//
// Error mapping lives here so tool authors never think about it and it stays
// consistent:
//   - non-2xx  → HttpError (carries .status)
//   - Cloudflare "Just a moment" interstitial → McpToolError with a refresh hint
//   - sign-in redirect / login page → SessionNotAuthenticatedError
import {
  McpToolError,
  SessionNotAuthenticatedError,
  truncateErrorMessage,
} from '@chrischall/mcp-utils';
import { extractReduxSlice } from './redux-state.js';
import type { FetchResult, TockTransport } from './transport.js';

/** Thrown on any non-2xx response. Carries the numeric `status` so callers
 *  can branch (e.g. get_restaurant treats 404 as "no such venue"). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export { SessionNotAuthenticatedError };

export interface TockClientOptions {
  transport: TockTransport;
}

export class TockClient {
  private readonly transport: TockTransport;

  constructor(opts: TockClientOptions) {
    this.transport = opts.transport;
  }

  async start(): Promise<void> {
    await this.transport.start();
  }

  async close(): Promise<void> {
    await this.transport.close();
  }

  /** GET a path and return the raw HTML body. Throws on non-2xx, Cloudflare
   *  challenge, or a sign-in page. */
  async fetchHtml(path: string): Promise<string> {
    const result = await this.transport.fetch({ path, method: 'GET' });
    this.throwIfNotOk(result, 'GET', path);
    this.throwIfChallenge(result);
    this.throwIfSignInPage(result);
    return result.body;
  }

  /** GET a path and return one named top-level slice of its
   *  window.$REDUX_STATE store (e.g. 'app', 'consumerPage', 'calendar'). */
  async fetchSlice(path: string, key: string): Promise<unknown> {
    const html = await this.fetchHtml(path);
    return extractReduxSlice(html, key);
  }

  /** GET a path once and extract several slices from the same HTML. */
  async fetchSlices<K extends string>(
    path: string,
    keys: readonly K[]
  ): Promise<Record<K, unknown>> {
    const html = await this.fetchHtml(path);
    const out = {} as Record<K, unknown>;
    for (const key of keys) out[key] = extractReduxSlice(html, key);
    return out;
  }

  private throwIfNotOk(result: FetchResult, method: string, path: string): void {
    if (result.status >= 200 && result.status < 300) return;
    // A 403 from Cloudflare is a challenge, not a missing resource — surface
    // that as the actionable challenge error rather than a bare HTTP error.
    if (result.status === 403 && this.looksLikeChallenge(result.body)) {
      this.throwChallenge();
    }
    const collapsed = result.body.replace(/\s+/g, ' ').trim();
    const bodyPreview = collapsed ? ` — ${truncateErrorMessage(collapsed)}` : '';
    throw new HttpError(
      result.status,
      `Tock API error: ${result.status} for ${method} ${path}${bodyPreview}`
    );
  }

  private looksLikeChallenge(body: string): boolean {
    // Definitive Cloudflare managed-challenge markers only (per the fleet's
    // tightened detection) — not cdn-cgi/challenge-platform, which appears on
    // cleared pages too.
    return body.includes('_cf_chl_opt') || body.includes('<title>Just a moment');
  }

  private throwIfChallenge(result: FetchResult): void {
    if (this.looksLikeChallenge(result.body)) this.throwChallenge();
  }

  private throwChallenge(): never {
    throw new McpToolError(
      'Tock served a Cloudflare "Just a moment" challenge instead of the page.',
      {
        hint:
          'Open exploretock.com in the browser tab the fetchproxy extension is ' +
          'signed into, let the Cloudflare check clear (and sign in if prompted), ' +
          'then retry.',
      }
    );
  }

  private throwIfSignInPage(result: FetchResult): void {
    // Tock 302s account pages (/reservations, /user) to a login URL when the
    // session is signed out; the landing page is a login form.
    const url = result.url || '';
    const looksLikeSignIn =
      /\/login\b/.test(url) ||
      /\/(signin|sign-in)\b/.test(url) ||
      (result.body.includes('loginWithTockJwt') &&
        result.body.length < 60_000);
    if (looksLikeSignIn) {
      throw new SessionNotAuthenticatedError('Tock', 'exploretock.com');
    }
  }
}
