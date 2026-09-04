import { z } from 'zod';
import { McpToolError, SessionNotAuthenticatedError, minifiedResult } from '@chrischall/mcp-utils';
import { viewArg, viewResponse } from '../view.js';
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

// `PatronReservationHistory` lags the Reservations tab by minutes, so an
// absence read too soon after booking is not evidence of anything. Below this
// age the tool reports not_found but flags the result as inconclusive.
// (tock-mcp#48: a booking reported "confirmed" off one screenshot never existed;
// the rule written down in #49 only helps if something enforces it.)
const LAG_WINDOW_MINUTES = 5;

/** Case-insensitive match of a query against a reservation's name or slug. */
function matchesVenue(r: { venue?: string; venueSlug?: string }, query: string): boolean {
  const needle = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!needle) return false;
  const hay = `${r.venue ?? ''} ${r.venueSlug ?? ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  return hay.includes(needle);
}

/** Tock returns `2026-07-31T17:00:00`; compare on the local date part only. */
function matchesDate(r: { dateTime?: string }, date: string): boolean {
  return typeof r.dateTime === 'string' && r.dateTime.slice(0, 10) === date;
}

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
      return minifiedResult({
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
      inputSchema: {
        view: viewArg(),},
    },
    async ({ view }) => {
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
      return viewResponse(view, identity);
    }
  );

  server.registerTool(
    'tock_verify_reservation',
    {
      description:
        "Verify that a Tock reservation actually exists, by re-querying the account's own reservation lists (upcoming, canceled and past) and returning an explicit verdict. Use this after ANY booking attempt — a success screen or screenshot is not proof that a booking landed. Returns verdict `confirmed`, `cancelled` (it existed and was voided) or `not_found`. A `not_found` must be reported to the user as \"attempted, unverified\", never as a failure to book and never as a success. Requires a browser tab signed in to exploretock.com via the fetchproxy extension.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        venue: z
          .string()
          .min(1)
          .describe('Restaurant name or Tock slug; matched case-insensitively as a substring.'),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
          .describe('The local date the reservation is for (YYYY-MM-DD).'),
        partySize: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('If given, a candidate must also match this party size.'),
        bookedMinutesAgo: z
          .number()
          .nonnegative()
          .optional()
          .describe(
            'Minutes since the booking was attempted. Drives the lag caveat: an absence seen within ' +
              'a few minutes of booking is inconclusive, not proof. Omit if unknown (treated as inconclusive).'
          ),
      },
    },
    async (input) => {
      // Read every list: an upcoming booking proves success, a canceled one
      // proves it was created then voided, and a past-dated one is still a
      // real booking. Checking only `upcoming` would misreport two of three.
      const selections: ReservationSelection[] = ['UPCOMING', 'CANCELED', 'PAST'];
      const lists = await Promise.all(
        selections.map(async (selection) => parseReservations(await fetchPurchases(client, selection, 0, 50)))
      );
      const [upcoming, canceled, past] = lists;
      const searched = { upcoming: upcoming.length, canceled: canceled.length, past: past.length };

      const candidates = [...upcoming, ...canceled, ...past].filter(
        (r) =>
          matchesVenue(r, input.venue) &&
          matchesDate(r, input.date) &&
          (input.partySize === undefined || r.partySize === input.partySize)
      );
      // Prefer a live record: a venue can hold both a cancelled and a rebooked
      // reservation for the same date, and the live one is the answer.
      const live = candidates.find((r) => r.cancelledOrRefunded !== true);
      const match = live ?? candidates[0];

      if (match) {
        const cancelled = match.cancelledOrRefunded === true;
        return minifiedResult({
          verdict: cancelled ? 'cancelled' : 'confirmed',
          match,
          searched,
          recheckAdvised: false,
          reportAs: cancelled
            ? 'The reservation exists but is cancelled or refunded — it will not be honoured.'
            : 'Confirmed: the reservation is present in the account.',
          summary: cancelled
            ? `Found a ${input.date} reservation at ${match.venue ?? input.venue}, but it is cancelled or refunded.`
            : `Confirmed: ${match.venue ?? input.venue} on ${input.date}${
                match.partySize ? ` for ${match.partySize}` : ''
              } is present in the account.`,
        });
      }

      // Nothing matched. Whether that is proof depends entirely on how long ago
      // the booking was attempted — see LAG_WINDOW_MINUTES.
      const tooSoon =
        input.bookedMinutesAgo === undefined || input.bookedMinutesAgo < LAG_WINDOW_MINUTES;
      return minifiedResult({
        verdict: 'not_found',
        match: null,
        searched,
        recheckAdvised: tooSoon,
        reportAs: 'attempted, unverified',
        summary: tooSoon
          ? `No matching reservation yet, but this is inconclusive: the reservations backend lags by ` +
            `minutes, so re-check in ~2 minutes before drawing any conclusion. Report as "attempted, ` +
            `unverified" — not as booked, and not yet as failed.`
          : `No record of a ${input.date} reservation at "${input.venue}" in the account's upcoming, ` +
            `canceled or past lists (${searched.upcoming}/${searched.canceled}/${searched.past} checked), ` +
            `${input.bookedMinutesAgo} minutes after booking — past the backend lag window. Report as ` +
            `"attempted, unverified": the booking most likely never completed.`,
      });
    }
  );
}


// Re-exported so index.ts / tests can reference the canonical sign-in error.
export { SessionNotAuthenticatedError };
