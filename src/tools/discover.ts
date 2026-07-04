import { z } from 'zod';
import { textResult, NonEmptyString } from '@chrischall/mcp-utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TockClient } from '../client.js';
import { parseMetros, parseListings } from '../parse.js';

export function registerDiscoverTools(
  server: McpServer,
  client: TockClient
): void {
  server.registerTool(
    'tock_list_metros',
    {
      description:
        'List Tock cities/metros (name, slug, business count, country/state). Use a metro slug with tock_search_restaurants. By default only metros with bookable venues are returned.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe('Case-insensitive filter on metro name or slug (e.g. "chic").'),
        country: z
          .string()
          .optional()
          .describe('Filter by 2-letter country code (e.g. "US", "GB").'),
        include_empty: z
          .boolean()
          .optional()
          .describe('Include metros with businessCount 0 (default false).'),
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe('Max metros to return (default 100).'),
      },
    },
    async (input) => {
      const app = await client.fetchSlice('/city', 'app');
      let metros = parseMetros(app);
      if (!input.include_empty) metros = metros.filter((m) => m.businessCount > 0);
      if (input.country) {
        const c = input.country.toUpperCase();
        metros = metros.filter((m) => (m.country ?? '').toUpperCase() === c);
      }
      if (input.query) {
        const q = input.query.toLowerCase();
        metros = metros.filter(
          (m) =>
            m.name.toLowerCase().includes(q) || m.slug.toLowerCase().includes(q)
        );
      }
      metros.sort((a, b) => b.businessCount - a.businessCount);
      const limit = input.limit ?? 100;
      return textResult({ count: metros.length, metros: metros.slice(0, limit) });
    }
  );

  server.registerTool(
    'tock_search_restaurants',
    {
      description:
        'List / search restaurants in a Tock metro. Pass a metro slug (from tock_list_metros, e.g. "chicago") and an optional text query. Returns venues with cuisine, price band, neighborhood, and their Tock slug (use it with tock_get_restaurant / tock_get_availability). Does NOT include bookable slots.',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        metro: NonEmptyString.describe('Metro slug, e.g. "chicago" or "new-york".'),
        query: z
          .string()
          .optional()
          .describe('Free-text filter (cuisine or venue name) applied server-side.'),
        limit: z
          .number()
          .int()
          .positive()
          .max(200)
          .optional()
          .describe('Max venues to return (default 50).'),
      },
    },
    async (input) => {
      const qs = input.query
        ? `?query=${encodeURIComponent(input.query)}`
        : '';
      const path = `/city/${encodeURIComponent(input.metro)}${qs}`;
      const consumerPage = await client.fetchSlice(path, 'consumerPage');
      const results = parseListings(consumerPage);
      const limit = input.limit ?? 50;
      return textResult({
        metro: input.metro,
        query: input.query ?? null,
        count: results.length,
        restaurants: results.slice(0, limit),
      });
    }
  );
}
