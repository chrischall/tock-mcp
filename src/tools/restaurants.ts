import { z } from 'zod';
import {
  textResult,
  NonEmptyString,
  McpToolError,
  UpstreamHttpError,
} from '@chrischall/mcp-utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type TockClient } from '../client.js';
import { parseRestaurant, parseAvailability } from '../parse.js';

/** Tock venue slug: the /{slug} path segment (its `domainName`). Reject path
 *  separators / query chars so a slug can't smuggle in another path. */
const VenueSlug = NonEmptyString.regex(
  /^[A-Za-z0-9._-]+$/,
  'slug must be a bare Tock page slug like "alinea" (no slashes or spaces)'
).describe('Tock venue slug, e.g. "alinea" (the exploretock.com/{slug} segment).');

const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
  .optional();

export function registerRestaurantTools(
  server: McpServer,
  client: TockClient
): void {
  server.registerTool(
    'tock_get_restaurant',
    {
      description:
        'Get details for a Tock venue by slug: name, cuisine, price band, location, description, and its bookable experiences (with prices and party sizes). Slug comes from tock_search_restaurants (or a exploretock.com/{slug} URL).',
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        slug: VenueSlug,
      },
    },
    async (input) => {
      const slices = await fetchVenue(client, input.slug);
      const details = parseRestaurant(slices.app, input.slug);
      if (!details) {
        throw new McpToolError(
          `No Tock venue found at "/${input.slug}".`,
          { hint: 'Check the slug with tock_search_restaurants — it is the exploretock.com/{slug} path segment.' }
        );
      }
      const availability = parseAvailability(slices.calendar);
      return textResult({
        ...details,
        experiences: availability?.experiences ?? [],
        openDateCount: availability?.openDates.length ?? 0,
      });
    }
  );

  server.registerTool(
    'tock_get_availability',
    {
      description:
        "Get a venue's bookable calendar: each experience (seating/menu) with its price, party sizes, cancellation policy, plus the dates and times the venue is open. Tock returns the full open-date/time set; pass a date to focus the summary. Reservations are prepaid tickets — this MCP does not book; open the venue on exploretock.com to reserve.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        slug: VenueSlug,
        date: DateSchema.describe('YYYY-MM-DD to center the calendar on (optional).'),
        party_size: z
          .number()
          .int()
          .positive()
          .max(50)
          .optional()
          .describe('Guests — filters experiences to those accepting this size.'),
      },
    },
    async (input) => {
      const path = input.date
        ? `/${input.slug}/search?date=${input.date}&size=${input.party_size ?? 2}`
        : `/${input.slug}`;
      const calendar = await client.fetchSlice(path, 'calendar').catch((e) => {
        if (e instanceof UpstreamHttpError && e.status === 404) return null;
        throw e;
      });
      if (calendar === null) {
        throw new McpToolError(`No Tock venue found at "/${input.slug}".`, {
          hint: 'Check the slug with tock_search_restaurants.',
        });
      }
      const availability = parseAvailability(calendar);
      if (!availability) {
        return textResult({
          slug: input.slug,
          date: input.date ?? null,
          experiences: [],
          openDates: [],
          openTimes: [],
          note: 'This venue is not currently offering reservations.',
        });
      }
      let experiences = availability.experiences;
      if (input.party_size !== undefined) {
        experiences = experiences.filter(
          (e) => !e.partySize || e.partySize.includes(input.party_size!)
        );
      }
      const dateOpen =
        input.date === undefined ? undefined : availability.openDates.includes(input.date);
      return textResult({
        slug: input.slug,
        date: input.date ?? null,
        party_size: input.party_size ?? null,
        dateOpen,
        experiences,
        openDates: availability.openDates,
        openTimes: availability.openTimes,
      });
    }
  );
}

/** Fetch the 'app' (business) and 'calendar' (offerings) slices of a venue
 *  page in one request, mapping a 404 to a helpful not-found error. */
async function fetchVenue(
  client: TockClient,
  slug: string
): Promise<{ app: unknown; calendar: unknown }> {
  try {
    return (await client.fetchSlices(`/${slug}`, ['app', 'calendar'] as const)) as {
      app: unknown;
      calendar: unknown;
    };
  } catch (e) {
    if (e instanceof UpstreamHttpError && e.status === 404) {
      throw new McpToolError(`No Tock venue found at "/${slug}".`, {
        hint: 'Check the slug with tock_search_restaurants — it is the exploretock.com/{slug} path segment.',
      });
    }
    throw e;
  }
}
