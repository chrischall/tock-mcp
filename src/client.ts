// TockClient is the thin, tool-facing API over a TockTransport. Every read
// goes through fetchState() — GET an exploretock.com page through the user's
// signed-in browser tab, then extract its embedded window.$REDUX_STATE store.
//
// Error mapping lives here so tool authors never think about it and it stays
// consistent:
//   - non-2xx  → UpstreamHttpError (carries .status)
//   - Cloudflare "Just a moment" interstitial → McpToolError with a refresh hint
//   - sign-in redirect / login page → SessionNotAuthenticatedError
import {
  McpToolError,
  SessionNotAuthenticatedError,
  truncateErrorMessage,
  UpstreamHttpError,
} from '@chrischall/mcp-utils';
import { isCloudflareChallenge } from '@chrischall/mcp-utils/scrape';
import { extractReduxSlice } from './redux-state.js';
import type { FetchResult, TockTransport } from './transport.js';

// Non-2xx responses throw the fleet-shared `UpstreamHttpError`
// (`@chrischall/mcp-utils`), which carries the numeric `.status` so callers
// can branch (e.g. get_restaurant treats 404 as "no such venue"). Tools that
// need it import it straight from `@chrischall/mcp-utils`, so it isn't
// re-exported here. `SessionNotAuthenticatedError` is re-exported so callers
// that already import `TockClient` from this module (e.g. the client tests)
// can pull the error type from the same place.
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

  /**
   * Run a Tock GraphQL operation through the signed-in bridge. Tock routes the
   * operation name in the path: `POST /api/graphql/<op>?opname=<op>` with a
   * JSON `{operationName, variables, query}` body. Returns the `data` payload.
   *
   * Used for the authenticated reads (reservation history, account identity)
   * whose data is NOT in the SSR store — it's lazy-loaded from this API. Throws
   * SessionNotAuthenticatedError when signed out, and McpToolError on GraphQL
   * or transport errors.
   */
  async graphql<T = unknown>(
    operationName: string,
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    const path = `/api/graphql/${encodeURIComponent(operationName)}?opname=${encodeURIComponent(
      operationName
    )}`;
    const result = await this.transport.fetch({
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ operationName, variables, query }),
    });
    this.throwIfChallenge(result);
    this.throwIfSignInPage(result);
    if (result.status === 401 || result.status === 403) {
      throw new SessionNotAuthenticatedError('Tock', 'exploretock.com');
    }
    this.throwIfNotOk(result, 'POST', path);
    let parsed: { data?: T; errors?: Array<{ message?: string }> };
    try {
      parsed = JSON.parse(result.body);
    } catch {
      // A non-JSON 2xx is almost always a bot/sign-in interstitial.
      throw new McpToolError(
        `Tock GraphQL ${operationName} returned a non-JSON response.`,
        {
          hint: 'Open exploretock.com in the signed-in fetchproxy tab, ensure you are logged in and the Cloudflare check has cleared, then retry.',
        }
      );
    }
    if (parsed.errors?.length) {
      const msg = parsed.errors.map((e) => e.message).filter(Boolean).join('; ');
      if (/auth|sign|login|unauthorized|permission/i.test(msg)) {
        throw new SessionNotAuthenticatedError('Tock', 'exploretock.com');
      }
      throw new McpToolError(
        `Tock GraphQL ${operationName} error: ${truncateErrorMessage(msg)}`
      );
    }
    return parsed.data as T;
  }

  private throwIfNotOk(result: FetchResult, method: string, path: string): void {
    if (result.status >= 200 && result.status < 300) return;
    // A 403 from Cloudflare is a challenge, not a missing resource — surface
    // that as the actionable challenge error rather than a bare HTTP error.
    if (result.status === 403 && isCloudflareChallenge(result.body)) {
      this.throwChallenge();
    }
    const collapsed = result.body.replace(/\s+/g, ' ').trim();
    const bodyPreview = collapsed ? ` — ${truncateErrorMessage(collapsed)}` : '';
    throw new UpstreamHttpError(
      result.status,
      `Tock API error: ${result.status} for ${method} ${path}${bodyPreview}`
    );
  }

  private throwIfChallenge(result: FetchResult): void {
    // Definitive Cloudflare managed-challenge markers only (shared
    // `isCloudflareChallenge`): `_cf_chl_opt` / `<title>Just a moment`, never
    // cdn-cgi/challenge-platform, which appears on cleared pages too.
    if (isCloudflareChallenge(result.body)) this.throwChallenge();
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
