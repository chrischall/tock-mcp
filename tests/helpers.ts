import type { TockClient } from '../src/client.js';

/**
 * A TockClient stub for tool tests: map a path (or a path + slice key) to the
 * value the client should return, without any real transport/bridge. Only the
 * methods the tools use are implemented.
 */
export interface StubResponses {
  /** slice by "path::key" (fetchSlice) or "path" (fetchSlices returns object). */
  slices?: Record<string, unknown>;
  /** raw HTML by path (fetchHtml). */
  html?: Record<string, string>;
  /** throw this error for a given "path::key" or path instead of returning. */
  errors?: Record<string, Error>;
}

export function stubClient(responses: StubResponses): TockClient {
  const { slices = {}, html = {}, errors = {} } = responses;
  const client = {
    async start() {},
    async close() {},
    async fetchHtml(path: string): Promise<string> {
      if (errors[path]) throw errors[path];
      if (path in html) return html[path];
      throw new Error(`stub: no html for ${path}`);
    },
    async fetchSlice(path: string, key: string): Promise<unknown> {
      const id = `${path}::${key}`;
      if (errors[id]) throw errors[id];
      if (id in slices) return slices[id];
      throw new Error(`stub: no slice for ${id}`);
    },
    async fetchSlices(
      path: string,
      keys: readonly string[]
    ): Promise<Record<string, unknown>> {
      if (errors[path]) throw errors[path];
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        const id = `${path}::${key}`;
        if (errors[id]) throw errors[id];
        out[key] = slices[id];
      }
      return out;
    },
  };
  return client as unknown as TockClient;
}
