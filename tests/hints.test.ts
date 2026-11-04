import { describe, it, expect } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { registerBridgeHealthcheckTool } from '@chrischall/mcp-utils/fetchproxy';
import { registerDiscoverTools } from '../src/tools/discover.js';
import { registerRestaurantTools } from '../src/tools/restaurants.js';
import { registerAccountTools } from '../src/tools/account.js';
import { stubClient, type StubResponses } from './helpers.js';
import type { TockClient } from '../src/client.js';

/**
 * Context-group hints (`_meta.mint`, the mcp-host context-groups contract),
 * read off `tools/list` — what a host sees — for every tool this server
 * serves, the healthcheck included so a dropped registrar cannot hide.
 */
type Listed = {
  name: string;
  annotations?: { readOnlyHint?: boolean };
  inputSchema: { properties?: Record<string, Record<string, unknown>> };
  _meta?: { mint?: Record<string, unknown> };
};

const DOMAINS = ['school', 'home', 'work', 'family', 'health', 'money', 'travel', 'food'];
const INTENTS = ['whats-new', 'whats-due', 'whats-on', 'lookup', 'turn-on-off', 'send', 'change', 'other'];
const CANONICAL_INTENTS = ['whats-new', 'whats-due', 'whats-on'];
const KEYS = ['domain', 'intent', 'canonical', 'subject', 'when', 'aliases'];

function harness(responses: StubResponses = {}) {
  const client = stubClient(responses);
  return createTestHarness((server) => {
    registerDiscoverTools(server, client);
    registerRestaurantTools(server, client);
    registerAccountTools(server, client);
    registerBridgeHealthcheckTool({
      server,
      prefix: 'tock',
      probePath: '/robots.txt',
      hostLabel: 'www.exploretock.com',
      transport: {} as never,
      probeFn: (path) => (client as TockClient).fetchHtml(path),
    });
  });
}

async function served(): Promise<Listed[]> {
  const h = await harness();
  const { tools } = await h.client.listTools();
  await h.close();
  return tools as Listed[];
}

/** The intent every tool declares — this table is the assertion. */
const EXPECTED_INTENT: Record<string, string> = {
  tock_list_metros: 'lookup',
  tock_search_restaurants: 'lookup',
  tock_get_restaurant: 'lookup',
  tock_get_availability: 'lookup',
  tock_list_reservations: 'whats-on',
  tock_get_profile: 'lookup',
  tock_verify_reservation: 'lookup',
};

describe('_meta.mint on tools/list', () => {
  it('names every served tool, so a new tool cannot skip the decision', async () => {
    const names = (await served()).map((t) => t.name).sort();
    expect(names).toEqual([...Object.keys(EXPECTED_INTENT), 'tock_healthcheck'].sort());
  });

  it('every tool except the healthcheck carries domain food and its intent', async () => {
    for (const t of await served()) {
      const mint = t._meta?.mint;
      if (t.name === 'tock_healthcheck') {
        // registered by mcp-utils, which takes no _meta: it joins no group
        expect(mint, t.name).toBeUndefined();
        continue;
      }
      expect(mint, t.name).toBeDefined();
      expect(mint!.domain, t.name).toBe('food');
      expect(mint!.intent, t.name).toBe(EXPECTED_INTENT[t.name]);
    }
  });

  it('every hint is shaped per the host contract', async () => {
    for (const t of await served()) {
      const mint = t._meta?.mint;
      if (!mint) continue;
      const props = t.inputSchema.properties ?? {};
      expect(Object.keys(mint).filter((k) => !KEYS.includes(k)), t.name).toEqual([]);
      expect(DOMAINS, t.name).toContain(mint.domain);
      expect(INTENTS, t.name).toContain(mint.intent);
      if ('canonical' in mint) {
        expect(mint.canonical, t.name).toBe(true);
        expect(t.annotations?.readOnlyHint, t.name).toBe(true);
        expect(CANONICAL_INTENTS, t.name).toContain(mint.intent);
      }
      if ('subject' in mint) expect(props, t.name).toHaveProperty(mint.subject as string);
      if ('when' in mint) {
        const when = mint.when as Record<string, string>;
        expect(Object.keys(when).sort(), t.name).toEqual(['end', 'start']);
        expect(props, t.name).toHaveProperty(when.start);
        expect(props, t.name).toHaveProperty(when.end);
      }
      if ('aliases' in mint) {
        const aliases = mint.aliases as string[];
        expect(aliases.length, t.name).toBeLessThanOrEqual(8);
        for (const a of aliases) {
          expect(a.length, t.name).toBeLessThanOrEqual(40);
          expect(a, t.name).toBe(a.toLowerCase());
          expect(a, t.name).not.toMatch(/^tock_/);
        }
      }
    }
  });

  it('has at most one canonical read per canonical intent', async () => {
    const canonical = (await served()).filter((t) => t._meta?.mint?.canonical === true);
    for (const intent of CANONICAL_INTENTS) {
      expect(canonical.filter((t) => t._meta?.mint?.intent === intent).length, intent).toBeLessThanOrEqual(1);
    }
  });

  it('marks exactly one canonical read: the reservations list for whats-on, with no subject or range', async () => {
    const canonical = (await served()).filter((t) => t._meta?.mint?.canonical === true);
    expect(canonical.map((t) => t.name)).toEqual(['tock_list_reservations']);
    expect(canonical[0]._meta?.mint).toEqual({
      domain: 'food',
      intent: 'whats-on',
      canonical: true,
      aliases: ['reservations', 'dinner reservations', 'bookings', 'dinner plans', 'where are we eating'],
    });
  });

  it('every canonical read offers view: brief', async () => {
    for (const t of (await served()).filter((x) => x._meta?.mint?.canonical === true)) {
      expect(t.inputSchema.properties?.view?.enum, t.name).toContain('brief');
    }
  });
});

describe('tock_list_reservations view: brief', () => {
  const purchases = [
    {
      id: 1,
      business: { name: 'Example Tasting Room', domainName: 'example-tasting-room' },
      ticketDateTime: '2026-08-01T18:00:00',
      ticketCount: 2,
      ticketType: { name: 'Chef Counter', variety: 'PRIX_FIXE' },
      cancelledOrRefunded: false,
    },
    {
      id: 2,
      business: { name: 'Sample Bistro', domainName: 'sample-bistro' },
      ticketCount: 4,
      cancelledOrRefunded: true,
    },
    {
      id: 3,
      business: { name: 'A'.repeat(200), domainName: 'long' },
      ticketDateTime: '2026-08-03T19:30:00',
      ticketCount: 1,
      ticketType: { name: 'B'.repeat(200) },
    },
  ];

  async function briefText(
    args: Record<string, unknown>,
    selection = 'UPCOMING',
    rows: unknown[] = purchases
  ): Promise<string> {
    const h = await harness({ graphql: { [`PatronReservationHistory::${selection}`]: { purchases: rows } } });
    const res = await h.callTool('tock_list_reservations', { ...args, view: 'brief' });
    await h.close();
    return (res.content as { type: string; text: string }[])[0].text;
  }

  async function brief(
    args: Record<string, unknown>,
    selection = 'UPCOMING',
    rows: unknown[] = purchases
  ): Promise<string[]> {
    const body = JSON.parse(await briefText(args, selection, rows)) as { data: string[] };
    return body.data;
  }

  it('answers one line per item, each ≤ 120 chars, shaped "title — <ISO date | no date> — <status>"', async () => {
    const lines = await brief({});
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line.length, line).toBeLessThanOrEqual(120);
      expect(line, line).toMatch(/^.+ — (\d{4}-\d{2}-\d{2}(T[\d:]+)?|no date) — \S.*$/);
    }
  });

  it('names the venue, experience and party, the date, and the status', async () => {
    const lines = await brief({});
    expect(lines[0]).toBe('Example Tasting Room: Chef Counter (party of 2) — 2026-08-01T18:00:00 — upcoming');
    expect(lines[1]).toBe('Sample Bistro (party of 4) — no date — cancelled');
    expect(lines[2].endsWith(' — 2026-08-03T19:30:00 — upcoming')).toBe(true);
    expect(lines[2]).toContain('…');
  });

  it('reports the selection it read as the status', async () => {
    const lines = await brief({ status: 'past' }, 'PAST');
    expect(lines[0].endsWith(' — past')).toBe(true);
    expect(lines[1].endsWith(' — cancelled')).toBe(true);
  });

  it('rides inside the untrusted-data envelope, minified, note first (venue names are third-party)', async () => {
    const text = await briefText({});
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['untrusted_content', 'note', 'data']);
    expect(body.untrusted_content).toBe(true);
    expect(body.note).toMatch(/restaurants/);
    expect(Array.isArray(body.data)).toBe(true);
    expect(text).toBe(JSON.stringify(body));
  });

  it('answers the single note line "-- none" when there is nothing', async () => {
    expect(await brief({}, 'UPCOMING', [])).toEqual(['-- none']);
  });

  it('says "-- more" when the page came back full', async () => {
    const lines = await brief({ limit: 3 });
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe('-- more');
    expect(await brief({ limit: 4 })).toHaveLength(3);
  });

  it('escapes a title that starts with "-- " or "\\" with one leading backslash', async () => {
    const lines = await brief({}, 'UPCOMING', [
      { id: 1, business: { name: '-- none' }, ticketDateTime: '2026-08-01T18:00:00' },
      { id: 2, business: { name: '\\x' }, ticketDateTime: '2026-08-01T18:00:00' },
      { id: 3, business: { name: '--x' }, ticketDateTime: '2026-08-01T18:00:00' },
    ]);
    expect(lines[0]).toBe('\\-- none — 2026-08-01T18:00:00 — upcoming');
    expect(lines[1]).toBe('\\\\x — 2026-08-01T18:00:00 — upcoming');
    expect(lines[2]).toBe('--x — 2026-08-01T18:00:00 — upcoming');
  });

  it('cuts the WHOLE line to ≤ 120 chars, title first, even when the date runs long', async () => {
    const lines = await brief({}, 'UPCOMING', [
      { id: 1, business: { name: 'C'.repeat(80) }, ticketDateTime: '2'.repeat(150) },
      { id: 2, business: { name: '-- ' + 'D'.repeat(200) }, ticketDateTime: '2026-08-01T18:00:00' },
    ]);
    for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(120);
    expect(lines[0].startsWith('C')).toBe(true);
    expect(lines[1].startsWith('\\-- D')).toBe(true);
    expect(lines[1].endsWith(' — 2026-08-01T18:00:00 — upcoming')).toBe(true);
  });

  it('keeps the full JSON answer by default', async () => {
    const h = await harness({ graphql: { 'PatronReservationHistory::UPCOMING': { purchases } } });
    const res = await h.callTool('tock_list_reservations', {});
    await h.close();
    const body = JSON.parse((res.content as { text: string }[])[0].text);
    expect(body.count).toBe(3);
  });
});
