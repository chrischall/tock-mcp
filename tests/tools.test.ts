import { describe, it, expect } from 'vitest';
import { createTestHarness, parseToolResult } from '@chrischall/mcp-utils/test';
import { registerDiscoverTools } from '../src/tools/discover.js';
import { registerRestaurantTools } from '../src/tools/restaurants.js';
import { registerAccountTools } from '../src/tools/account.js';
import { SessionNotAuthenticatedError } from '@chrischall/mcp-utils';
import { stubClient } from './helpers.js';

const metroApp = {
  d: {
    metros: [
      { name: 'Chicago', slug: 'chicago', state: 'IL', country: 'US', businessCount: 1632 },
      { name: 'London', slug: 'london', country: 'GB', businessCount: 39 },
      { name: 'Akron', slug: 'akron', businessCount: 0 },
    ],
  },
};

const chicagoConsumerPage = {
  consumerPage: {
    w: { content: { business: [
      { domainName: 'alinea', name: 'Alinea', cuisines: 'American', priceRange: '$$$$', city: 'Chicago', state: 'IL' },
      { domainName: 'oriolechicago', name: 'Oriole', cuisines: 'Contemporary American', priceRange: '$$$$' },
    ] } },
  },
};

const alineaApp = {
  page: { business: { domainName: 'alinea', name: 'Alinea', cuisines: 'American', priceRange: '$$$$', city: 'Chicago', state: 'IL', timeZone: 'America/Chicago' } },
};
const alineaCalendar = {
  offerings: {
    experience: [
      { id: 1903, name: 'The Salon @ Alinea', shortCode: 'SAL', type: 'PRIX_FIXE', partySize: [1, 2, 4], pricePerPerson: { minCents: 37500, maxCents: 39500 }, ticketPriceInformation: { priceType: 'PREPAID' }, communicationPolicy: { canTransfer: true, cancellationPolicyText: 'Final.' } },
      { id: 1986, name: 'The Kitchen Table', shortCode: 'KT', partySize: [2, 3, 4, 5, 6], pricePerPerson: { minCents: 49500, maxCents: 49500 } },
    ],
    openDate: ['2026-07-10', '2026-07-11'],
    openTime: ['17:00', '20:00'],
  },
};

describe('tock_list_metros', () => {
  it('excludes empty metros by default and sorts by business count', async () => {
    const h = await createTestHarness((s) =>
      registerDiscoverTools(s, stubClient({ slices: { '/city::app': metroApp } }))
    );
    const res = parseToolResult<{ count: number; metros: { slug: string }[] }>(
      await h.callTool('tock_list_metros', {})
    );
    expect(res.metros.map((m) => m.slug)).toEqual(['chicago', 'london']);
    await h.close();
  });

  it('filters by country', async () => {
    const h = await createTestHarness((s) =>
      registerDiscoverTools(s, stubClient({ slices: { '/city::app': metroApp } }))
    );
    const res = parseToolResult<{ metros: { slug: string }[] }>(
      await h.callTool('tock_list_metros', { country: 'gb' })
    );
    expect(res.metros.map((m) => m.slug)).toEqual(['london']);
    await h.close();
  });
});

describe('tock_search_restaurants', () => {
  it('lists venues in a metro, mapping domainName to slug', async () => {
    const h = await createTestHarness((s) =>
      registerDiscoverTools(
        s,
        stubClient({ slices: { '/city/chicago::consumerPage': chicagoConsumerPage } })
      )
    );
    const res = parseToolResult<{ restaurants: { slug: string }[] }>(
      await h.callTool('tock_search_restaurants', { metro: 'chicago' })
    );
    expect(res.restaurants.map((r) => r.slug)).toEqual(['alinea', 'oriolechicago']);
    await h.close();
  });

  it('URL-encodes the query into the /city path', async () => {
    const h = await createTestHarness((s) =>
      registerDiscoverTools(
        s,
        stubClient({ slices: { '/city/chicago?query=wine%20bar::consumerPage': chicagoConsumerPage } })
      )
    );
    const res = await h.callTool('tock_search_restaurants', { metro: 'chicago', query: 'wine bar' });
    expect(res.isError).toBeFalsy();
    await h.close();
  });
});

describe('tock_get_restaurant', () => {
  it('returns venue details plus its experiences', async () => {
    const h = await createTestHarness((s) =>
      registerRestaurantTools(
        s,
        stubClient({ slices: { '/alinea::app': alineaApp, '/alinea::calendar': alineaCalendar } })
      )
    );
    const res = parseToolResult<{ name: string; experiences: { name: string }[]; openDateCount: number }>(
      await h.callTool('tock_get_restaurant', { slug: 'alinea' })
    );
    expect(res.name).toBe('Alinea');
    expect(res.experiences.map((e) => e.name)).toContain('The Salon @ Alinea');
    expect(res.openDateCount).toBe(2);
    await h.close();
  });

  it('rejects a slug with a path separator', async () => {
    const h = await createTestHarness((s) =>
      registerRestaurantTools(s, stubClient({}))
    );
    const res = await h.callTool('tock_get_restaurant', { slug: 'alinea/../evil' });
    expect(res.isError).toBeTruthy();
    await h.close();
  });

  // `parseRestaurant` is the only parsed shape in this server that carries
  // media URLs, so this tool is the only place compact strips anything real.
  // It shipped without the `view` wiring once, which made the whole feature a
  // no-op across the server — hence a test at the TOOL boundary and not just
  // on the helper.
  const alineaWithImages = {
    page: {
      business: {
        domainName: 'alinea',
        name: 'Alinea',
        cuisines: 'American',
        priceRange: '$$$$',
        profileImageUrl: 'https://images.exploretock.com/v1/signed/alinea-profile',
        heroImageUrl: 'https://images.exploretock.com/v1/signed/alinea-hero',
      },
    },
  };
  const withImages = () =>
    stubClient({
      slices: { '/alinea::app': alineaWithImages, '/alinea::calendar': alineaCalendar },
    });

  it('strips the venue image URLs by DEFAULT — compact is what a caller gets unasked', async () => {
    const h = await createTestHarness((s) => registerRestaurantTools(s, withImages()));
    const res = parseToolResult<Record<string, unknown>>(
      await h.callTool('tock_get_restaurant', { slug: 'alinea' })
    );
    expect(res.name).toBe('Alinea');
    expect(res.profileImageUrl).toBeUndefined();
    expect(res.heroImageUrl).toBeUndefined();
    // Subtractive, so everything that is not a picture is still here.
    expect(res.priceRange).toBe('$$$$');
    await h.close();
  });

  it('returns the image URLs on view: "full"', async () => {
    const h = await createTestHarness((s) => registerRestaurantTools(s, withImages()));
    const res = parseToolResult<Record<string, unknown>>(
      await h.callTool('tock_get_restaurant', { slug: 'alinea', view: 'full' })
    );
    expect(res.profileImageUrl).toBe('https://images.exploretock.com/v1/signed/alinea-profile');
    expect(res.heroImageUrl).toBe('https://images.exploretock.com/v1/signed/alinea-hero');
    await h.close();
  });

  it('emits a single line — no pretty-printing on either rung', async () => {
    const h = await createTestHarness((s) => registerRestaurantTools(s, withImages()));
    for (const args of [{ slug: 'alinea' }, { slug: 'alinea', view: 'full' }]) {
      const res = await h.callTool('tock_get_restaurant', args);
      const text = (res.content as { text: string }[])[0].text;
      expect(text.includes('\n')).toBe(false);
    }
    await h.close();
  });

  // `view` is a RESPONSE-shape argument; Tock has never heard of it. Two
  // sibling repos shipped a handler that forwarded its whole args object into
  // a query string and sent `view=compact` to the live API.
  it('never forwards `view` upstream', async () => {
    const paths: string[] = [];
    const client = withImages();
    const inner = client.fetchSlices.bind(client);
    client.fetchSlices = async (path: string, keys: readonly string[]) => {
      paths.push(path);
      return inner(path, keys);
    };
    const h = await createTestHarness((s) => registerRestaurantTools(s, client));
    await h.callTool('tock_get_restaurant', { slug: 'alinea', view: 'full' });
    expect(paths).toEqual(['/alinea']);
    await h.close();
  });
});

describe('tock_get_availability', () => {
  it('reports experiences, open dates/times and whether the date is open', async () => {
    const h = await createTestHarness((s) =>
      registerRestaurantTools(
        s,
        stubClient({ slices: { '/alinea/search?date=2026-07-10&size=2::calendar': alineaCalendar } })
      )
    );
    const res = parseToolResult<{ dateOpen: boolean; openDates: string[]; experiences: unknown[] }>(
      await h.callTool('tock_get_availability', { slug: 'alinea', date: '2026-07-10' })
    );
    expect(res.dateOpen).toBe(true);
    expect(res.openDates).toContain('2026-07-11');
    await h.close();
  });

  it('filters experiences by party size', async () => {
    const h = await createTestHarness((s) =>
      registerRestaurantTools(
        s,
        stubClient({ slices: { '/alinea/search?date=2026-07-10&size=5::calendar': alineaCalendar } })
      )
    );
    const res = parseToolResult<{ experiences: { name: string }[] }>(
      await h.callTool('tock_get_availability', { slug: 'alinea', date: '2026-07-10', party_size: 5 })
    );
    // Only the Kitchen Table accepts a party of 5.
    expect(res.experiences.map((e) => e.name)).toEqual(['The Kitchen Table']);
    await h.close();
  });

  it('rejects a malformed date', async () => {
    const h = await createTestHarness((s) =>
      registerRestaurantTools(s, stubClient({}))
    );
    const res = await h.callTool('tock_get_availability', { slug: 'alinea', date: 'July 10' });
    expect(res.isError).toBeTruthy();
    await h.close();
  });
});

const purchase = {
  id: 42,
  business: { name: 'Alinea', domainName: 'alinea' },
  ticketDateTime: '2026-08-01T18:00:00',
  ticketCount: 2,
  ticketType: { name: 'The Salon @ Alinea', variety: 'PRIX_FIXE' },
  city: 'Chicago',
  country: 'US',
  cancelledOrRefunded: false,
  ownerPatron: { firstName: 'Chris', lastName: 'Hall', email: 'c@example.com', id: 7 },
  dinerPatron: { firstName: 'Chris', lastName: 'Hall', email: 'c@example.com', id: 7 },
};

const soul = {
  id: 99,
  business: { name: 'Soul Gastrolounge', domainName: 'soulgastrolounge' },
  ticketDateTime: '2026-07-31T17:00:00',
  ticketCount: 2,
  ticketType: { name: 'Dinner', variety: 'RESERVATION' },
  city: 'Charlotte',
  cancelledOrRefunded: false,
};

/** All three selections at once — the tool reads every one before deciding. */
function allSelections(upcoming: unknown[], canceled: unknown[] = [], past: unknown[] = []) {
  return {
    'PatronReservationHistory::UPCOMING': { purchases: upcoming },
    'PatronReservationHistory::CANCELED': { purchases: canceled },
    'PatronReservationHistory::PAST': { purchases: past },
  };
}

async function verifyHarness(graphql: Record<string, unknown>) {
  return createTestHarness((s) => registerAccountTools(s, stubClient({ graphql })));
}

// The incident this encodes: chrischall/tock-mcp#48. A booking was reported
// "confirmed" on the strength of one screenshot; it did not exist. #49 wrote the
// rule down in SKILL.md, but prose is only as good as the agent that remembers
// it — this tool makes the re-query executable and its verdict unambiguous.
describe('tock_verify_reservation', () => {
  it('confirms a reservation that is present and not cancelled', async () => {
    const h = await verifyHarness(allSelections([soul]));
    const res = parseToolResult<{ verdict: string; match: { venue: string; partySize: number }; recheckAdvised: boolean }>(
      await h.callTool('tock_verify_reservation', { venue: 'Soul Gastrolounge', date: '2026-07-31' })
    );
    expect(res.verdict).toBe('confirmed');
    expect(res.match).toMatchObject({ venue: 'Soul Gastrolounge', partySize: 2 });
    expect(res.recheckAdvised).toBe(false);
    await h.close();
  });

  it('matches on venue slug and is case-insensitive', async () => {
    const h = await verifyHarness(allSelections([soul]));
    const res = parseToolResult<{ verdict: string }>(
      await h.callTool('tock_verify_reservation', { venue: 'SOULgastro', date: '2026-07-31' })
    );
    expect(res.verdict).toBe('confirmed');
    await h.close();
  });

  it('reports not_found as "attempted, unverified" — never as a pass', async () => {
    // The exact incident shape: nothing in any list.
    const h = await verifyHarness(allSelections([], [], []));
    const res = parseToolResult<{ verdict: string; reportAs: string; searched: Record<string, number> }>(
      await h.callTool('tock_verify_reservation', { venue: 'Soul Gastrolounge', date: '2026-07-31', bookedMinutesAgo: 60 })
    );
    expect(res.verdict).toBe('not_found');
    expect(res.reportAs).toMatch(/attempted, unverified/i);
    expect(res.searched).toEqual({ upcoming: 0, canceled: 0, past: 0 });
    await h.close();
  });

  it('finds a booking that was created then voided, in the canceled list', async () => {
    const h = await verifyHarness(allSelections([], [{ ...soul, cancelledOrRefunded: true }]));
    const res = parseToolResult<{ verdict: string; match: { venue: string } }>(
      await h.callTool('tock_verify_reservation', { venue: 'Soul', date: '2026-07-31' })
    );
    expect(res.verdict).toBe('cancelled');
    expect(res.match.venue).toBe('Soul Gastrolounge');
    await h.close();
  });

  it('treats a cancelledOrRefunded record in the upcoming list as cancelled, not confirmed', async () => {
    const h = await verifyHarness(allSelections([{ ...soul, cancelledOrRefunded: true }]));
    const res = parseToolResult<{ verdict: string }>(
      await h.callTool('tock_verify_reservation', { venue: 'Soul', date: '2026-07-31' })
    );
    expect(res.verdict).toBe('cancelled');
    await h.close();
  });

  it('finds a past-dated reservation in the past list', async () => {
    const h = await verifyHarness(allSelections([], [], [soul]));
    const res = parseToolResult<{ verdict: string }>(
      await h.callTool('tock_verify_reservation', { venue: 'Soul', date: '2026-07-31' })
    );
    expect(res.verdict).toBe('confirmed');
    await h.close();
  });

  it('does not match a different date at the same venue', async () => {
    const h = await verifyHarness(allSelections([soul]));
    const res = parseToolResult<{ verdict: string; searched: Record<string, number> }>(
      await h.callTool('tock_verify_reservation', { venue: 'Soul', date: '2026-08-01', bookedMinutesAgo: 60 })
    );
    expect(res.verdict).toBe('not_found');
    expect(res.searched.upcoming).toBe(1);
    await h.close();
  });

  it('does not match a different party size when one is given', async () => {
    const h = await verifyHarness(allSelections([soul]));
    const res = parseToolResult<{ verdict: string }>(
      await h.callTool('tock_verify_reservation', { venue: 'Soul', date: '2026-07-31', partySize: 4, bookedMinutesAgo: 60 })
    );
    expect(res.verdict).toBe('not_found');
    await h.close();
  });

  // The backend lags the Reservations tab by minutes, so an immediate absence
  // proves nothing. The tool must say so rather than let it read as failure.
  it('advises a re-check when absence is too fresh to be proof', async () => {
    const h = await verifyHarness(allSelections([]));
    const res = parseToolResult<{ verdict: string; recheckAdvised: boolean; summary: string }>(
      await h.callTool('tock_verify_reservation', { venue: 'Soul', date: '2026-07-31', bookedMinutesAgo: 1 })
    );
    expect(res.verdict).toBe('not_found');
    expect(res.recheckAdvised).toBe(true);
    expect(res.summary).toMatch(/lag|too soon|re-?check/i);
    await h.close();
  });

  it('advises a re-check when the booking time is unknown', async () => {
    const h = await verifyHarness(allSelections([]));
    const res = parseToolResult<{ recheckAdvised: boolean }>(
      await h.callTool('tock_verify_reservation', { venue: 'Soul', date: '2026-07-31' })
    );
    expect(res.recheckAdvised).toBe(true);
    await h.close();
  });

  it('stops advising a re-check once the lag window has passed', async () => {
    const h = await verifyHarness(allSelections([]));
    const res = parseToolResult<{ recheckAdvised: boolean; summary: string }>(
      await h.callTool('tock_verify_reservation', { venue: 'Soul', date: '2026-07-31', bookedMinutesAgo: 30 })
    );
    expect(res.recheckAdvised).toBe(false);
    expect(res.summary).toMatch(/no record/i);
    await h.close();
  });

  it('surfaces the sign-in error rather than reporting a false not_found', async () => {
    // A signed-out session must never look like "the booking does not exist".
    const h = await createTestHarness((s) =>
      registerAccountTools(
        s,
        stubClient({ graphqlErrors: { PatronReservationHistory: new SessionNotAuthenticatedError('Tock', 'exploretock.com') } })
      )
    );
    const res = await h.callTool('tock_verify_reservation', { venue: 'Soul', date: '2026-07-31' });
    expect(res.isError).toBeTruthy();
    expect(JSON.stringify(res.content)).toMatch(/sign(ed)? ?in/i);
    await h.close();
  });
});

describe('account tools (GraphQL)', () => {
  it('tock_list_reservations maps the purchases payload to summaries', async () => {
    const h = await createTestHarness((s) =>
      registerAccountTools(
        s,
        stubClient({ graphql: { 'PatronReservationHistory::UPCOMING': { purchases: [purchase] } } })
      )
    );
    const res = parseToolResult<{ count: number; reservations: { venue: string; venueSlug: string; partySize: number }[] }>(
      await h.callTool('tock_list_reservations', { status: 'upcoming' })
    );
    expect(res.count).toBe(1);
    expect(res.reservations[0]).toMatchObject({ venue: 'Alinea', venueSlug: 'alinea', partySize: 2, experience: 'The Salon @ Alinea' });
    await h.close();
  });

  it('tock_list_reservations selects PAST for status=past', async () => {
    const h = await createTestHarness((s) =>
      registerAccountTools(
        s,
        stubClient({ graphql: { 'PatronReservationHistory::PAST': { purchases: [] } } })
      )
    );
    const res = parseToolResult<{ count: number }>(
      await h.callTool('tock_list_reservations', { status: 'past' })
    );
    expect(res.count).toBe(0);
    await h.close();
  });

  it('tock_list_reservations surfaces the sign-in error from the client', async () => {
    const h = await createTestHarness((s) =>
      registerAccountTools(
        s,
        stubClient({ graphqlErrors: { PatronReservationHistory: new SessionNotAuthenticatedError('Tock', 'exploretock.com') } })
      )
    );
    const res = await h.callTool('tock_list_reservations', {});
    expect(res.isError).toBeTruthy();
    expect(JSON.stringify(res.content)).toMatch(/sign(ed)? ?in/i);
    await h.close();
  });

  it('tock_get_profile derives identity from ownerPatron', async () => {
    const h = await createTestHarness((s) =>
      registerAccountTools(
        s,
        stubClient({ graphql: { 'PatronReservationHistory::UPCOMING': { purchases: [purchase] } } })
      )
    );
    const res = parseToolResult<{ firstName: string; email: string }>(
      await h.callTool('tock_get_profile', {})
    );
    expect(res).toMatchObject({ firstName: 'Chris', email: 'c@example.com' });
    await h.close();
  });

  it('tock_get_profile falls back to PAST when no upcoming reservations', async () => {
    const h = await createTestHarness((s) =>
      registerAccountTools(
        s,
        stubClient({
          graphql: {
            'PatronReservationHistory::UPCOMING': { purchases: [] },
            'PatronReservationHistory::PAST': { purchases: [purchase] },
          },
        })
      )
    );
    const res = parseToolResult<{ email: string }>(await h.callTool('tock_get_profile', {}));
    expect(res.email).toBe('c@example.com');
    await h.close();
  });
});
