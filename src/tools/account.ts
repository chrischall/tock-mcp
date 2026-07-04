import { z } from 'zod';
import { textResult, SessionNotAuthenticatedError } from '@chrischall/mcp-utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TockClient } from '../client.js';
import { parsePatron } from '../parse.js';

// The signed-in patron lives in the 'patron' slice of /profile. When signed
// out the store carries no patron identity; we raise the canonical
// SessionNotAuthenticatedError so the user knows to sign in the bridge tab.
//
// NOTE: not verifiable without the user's own credentials (entering a password
// is off-limits), so these parse the documented patron.purchaseHistory /
// purchaseSummaries fields defensively and return whatever is present.

async function loadPatron(client: TockClient): Promise<Record<string, unknown>> {
  const slice = await client.fetchSlice('/profile', 'patron');
  const patron = parsePatron(slice);
  if (!patron) throw new SessionNotAuthenticatedError('Tock', 'exploretock.com');
  return patron;
}

export function registerAccountTools(
  server: McpServer,
  client: TockClient
): void {
  server.registerTool(
    'tock_list_reservations',
    {
      description:
        "List the signed-in user's Tock purchases / reservations (upcoming and past). Requires a browser tab signed in to exploretock.com via the fetchproxy extension — otherwise it reports that you need to sign in.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {
        limit: z
          .number()
          .int()
          .positive()
          .max(200)
          .optional()
          .describe('Max reservations to return (default 50).'),
      },
    },
    async (input) => {
      const patron = await loadPatron(client);
      const history = Array.isArray(patron.purchaseHistory)
        ? (patron.purchaseHistory as unknown[])
        : [];
      const summaries = Array.isArray(patron.purchaseSummaries)
        ? (patron.purchaseSummaries as unknown[])
        : [];
      const reservations = history.length ? history : summaries;
      const limit = input.limit ?? 50;
      return textResult({
        count: reservations.length,
        reservations: reservations.slice(0, limit),
      });
    }
  );

  server.registerTool(
    'tock_get_profile',
    {
      description:
        "Get the signed-in user's Tock profile (name, email, gift-card balance, loyalty). Requires a browser tab signed in to exploretock.com via the fetchproxy extension.",
      annotations: { readOnlyHint: true, openWorldHint: true },
      inputSchema: {},
    },
    async () => {
      const patron = await loadPatron(client);
      // Project the commonly-useful identity fields; fall back to the whole
      // record so nothing is silently hidden if the shape differs.
      const pick = [
        'firstName',
        'lastName',
        'email',
        'phone',
        'tockUid',
        'tockGiftCardBalanceCents',
        'isTockEmployee',
      ] as const;
      const profile: Record<string, unknown> = {};
      let anyPicked = false;
      for (const k of pick) {
        if (k in patron) {
          profile[k] = patron[k];
          anyPicked = true;
        }
      }
      return textResult(anyPicked ? profile : patron);
    }
  );
}
