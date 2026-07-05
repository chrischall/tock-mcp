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
