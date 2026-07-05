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
  /** GraphQL responses keyed by "<operationName>" or "<op>::<selection>". */
  graphql?: Record<string, unknown>;
  /** throw for a graphql key instead of returning. */
  graphqlErrors?: Record<string, Error>;
}

export function stubClient(responses: StubResponses): TockClient {
  const { slices = {}, html = {}, errors = {}, graphql = {}, graphqlErrors = {} } = responses;
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
    async graphql(
      operationName: string,
      _query: string,
      variables: Record<string, unknown> = {}
    ): Promise<unknown> {
      const sel = variables.selection as string | undefined;
      const keyed = sel ? `${operationName}::${sel}` : operationName;
      if (graphqlErrors[keyed]) throw graphqlErrors[keyed];
      if (graphqlErrors[operationName]) throw graphqlErrors[operationName];
      if (keyed in graphql) return graphql[keyed];
      if (operationName in graphql) return graphql[operationName];
      throw new Error(`stub: no graphql for ${keyed}`);
    },
  };
  return client as unknown as TockClient;
}
