import { z } from 'zod';
import { textResult, McpToolError, SessionNotAuthenticatedError } from '@chrischall/mcp-utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TockClient } from '../client.js';
import { parseReservations, parseAccountIdentity } from '../parse.js';
import {
  PATRON_RESERVATION_HISTORY,
  type ReservationSelection,
} from '../graphql-ops.js';

// The signed-in patron's reservations come from Tock's GraphQL API
// (POST /api/graphql/PatronReservationHistory) — NOT the SSR store, where the
// data is null / lazy-loaded. The bridge fetches with the user's session, so a
// signed-out call surfaces SessionNotAuthenticatedError.

const STATUS_TO_SELECTION: Record<string, ReservationSelection> = {
  upcoming: 'UPCOMING',
  past: 'PAST',
  canceled: 'CANCELED',
  cancelled: 'CANCELED',
};

async function fetchPurchases(
  client: TockClient,
  selection: ReservationSelection,
  offset: number,
  limit: number
): Promise<unknown> {
  return client.graphql('PatronReservationHistory', PATRON_RESERVATION_HISTORY, {
    offset,
    limit,
    selection,
  });
}

export function registerAccountTools(
  server: McpServer,
  client: TockClient
): void {
  server.registerTool(
    'tock_list_reservations',
    {
      description:
        "List the signed-in user's Tock reservations (upcoming, past, or canceled) with venue, date/time, party size, and experience. Requires a browser tab signed in to exploretock.com via the fetchproxy extension.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        status: z
          .enum(['upcoming', 'past', 'canceled'])
          .optional()
          .describe('Which reservations to list (default upcoming).'),
        limit: z.number().int().positive().max(100).optional().describe('Max to return (default 30).'),
        offset: z.number().int().nonnegative().optional().describe('Pagination offset (default 0).'),
      },
    },
    async (input) => {
      const selection = STATUS_TO_SELECTION[input.status ?? 'upcoming'];
      const data = await fetchPurchases(
        client,
        selection,
        input.offset ?? 0,
        input.limit ?? 30
      );
      const reservations = parseReservations(data);
      return textResult({
        status: input.status ?? 'upcoming',
        count: reservations.length,
        reservations,
      });
    }
  );

  server.registerTool(
    'tock_get_profile',
    {
      description:
        "Get the signed-in user's Tock account identity (name, email). Requires a browser tab signed in to exploretock.com via the fetchproxy extension. Derived from your reservation records, so it needs at least one reservation on the account.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {},
    },
    async () => {
      // Tock exposes no standalone profile query; ownerPatron rides on each
      // purchase. Check upcoming first, then past, for an identity to read.
      let identity = parseAccountIdentity(
        await fetchPurchases(client, 'UPCOMING', 0, 1)
      );
      if (!identity) {
        identity = parseAccountIdentity(await fetchPurchases(client, 'PAST', 0, 1));
      }
      if (!identity) {
        // The GraphQL calls above succeed only when signed in (else they raise
        // SessionNotAuthenticatedError), so reaching here means signed-in but
        // with no reservations to read identity from.
        throw new McpToolError(
          'Signed in, but Tock exposes no profile data without at least one reservation on the account.',
          { hint: 'Use tock_list_reservations once you have a reservation, or check the account on exploretock.com.' }
        );
      }
      return textResult(identity);
    }
  );
}

// Re-exported so index.ts / tests can reference the canonical sign-in error.
export { SessionNotAuthenticatedError };
