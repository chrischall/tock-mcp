import { describe, it, expect } from 'vitest';
import {
  parseMetros,
  parseListings,
  parseRestaurant,
  parseAvailability,
  parseReservations,
  parseAccountIdentity,
} from '../src/parse.js';

// Records below mirror the real exploretock.com $REDUX_STATE shapes captured
// during recon (docs/TOCK-API.md), trimmed to the fields the parsers read.

describe('parseMetros', () => {
  const appSlice = {
    someWidget: {
      metros: [
        { name: 'Chicago', slug: 'chicago', state: 'IL', country: 'US', businessCount: 1632, isActive: true, isFeatured: true, timezone: 'America/Chicago', currencyCode: 'USD', lat: 41.88, lng: -87.6, id: 4 },
        { name: 'London', slug: 'london', state: '', country: 'GB', businessCount: 39, isActive: true, isFeatured: false },
        { name: 'Akron', slug: 'akron', businessCount: 0, isActive: false },
        // duplicate slug should be dropped
        { name: 'Chicago', slug: 'chicago', businessCount: 1632 },
      ],
    },
  };

  it('projects the metro directory and dedupes by slug', () => {
    const metros = parseMetros(appSlice);
    expect(metros).toHaveLength(3);
    expect(metros[0]).toMatchObject({ name: 'Chicago', slug: 'chicago', businessCount: 1632, country: 'US' });
  });

  it('drops empty-string state/country to undefined', () => {
    const london = parseMetros(appSlice).find((m) => m.slug === 'london')!;
    expect(london.state).toBeUndefined();
    expect(london.country).toBe('GB');
  });

  it('returns [] when no metro array is present', () => {
    expect(parseMetros({ nothing: true })).toEqual([]);
  });
});

describe('parseListings', () => {
  const consumerPage = {
    consumerPage: {
      '/city/chicago': {
        variant: [
          {
            template: {
              widget: [
                {
                  content: {
                    business: [
                      { domainName: 'oriolechicago', name: 'Oriole', cuisines: 'Contemporary American', priceRange: '$$$$', businessType: 'Restaurant', neighborhood: 'West Loop', city: 'Chicago', state: 'IL', country: 'US', webUrl: 'http://www.oriolechicago.com', location: { address: '661 West Walnut Street', zipCode: '60661' } },
                      { domainName: 'alinea', name: 'Alinea', cuisines: 'American', priceRange: '$$$$', businessType: 'Restaurant', city: 'Chicago', state: 'IL' },
                    ],
                  },
                },
                // second widget repeats Oriole — must dedupe
                { content: { business: [{ domainName: 'oriolechicago', name: 'Oriole' }] } },
              ],
            },
          },
        ],
      },
    },
  };

  it('flattens business widgets and dedupes by domainName (slug)', () => {
    const list = parseListings(consumerPage);
    expect(list.map((r) => r.slug)).toEqual(['oriolechicago', 'alinea']);
  });

  it('maps domainName → slug and keeps documented fields', () => {
    const oriole = parseListings(consumerPage)[0];
    expect(oriole).toMatchObject({
      slug: 'oriolechicago',
      name: 'Oriole',
      cuisines: 'Contemporary American',
      priceRange: '$$$$',
      neighborhood: 'West Loop',
      webUrl: 'http://www.oriolechicago.com',
    });
    expect(oriole.location).toMatchObject({ zipCode: '60661' });
  });
});

describe('parseRestaurant', () => {
  const appSlice = {
    consumerPage: {
      business: { domainName: 'alinea', name: 'Alinea', cuisines: 'American', priceRange: '$$$$', businessType: 'Restaurant', city: 'Chicago', state: 'IL', description: 'Modernist cuisine.', profileImageUrl: 'https://img/a.jpg', timeZone: 'America/Chicago', currencyCode: 'USD' },
    },
  };

  it('finds the venue record by slug', () => {
    const r = parseRestaurant(appSlice, 'alinea')!;
    expect(r).toMatchObject({ slug: 'alinea', name: 'Alinea', priceRange: '$$$$', timeZone: 'America/Chicago' });
  });

  it('falls back to the sole priced record when no slug given', () => {
    expect(parseRestaurant(appSlice)!.name).toBe('Alinea');
  });

  it('returns null when the venue is absent', () => {
    expect(parseRestaurant({ x: 1 }, 'nope')).toBeNull();
  });
});

describe('parseAvailability', () => {
  const calendar = {
    offerings: {
      createdAt: '2026-07-03T21:25:20',
      experience: [
        {
          id: 1903, name: 'The Salon @ Alinea', slug: 'the-salon-alinea', shortCode: 'SAL', type: 'PRIX_FIXE', state: 'AVAILABLE', currencyCode: 'USD',
          description: 'Individual tables.', partySize: [1, 2, 3, 4, 5, 6],
          pricePerPerson: { minCents: 37500, maxCents: 39500 },
          ticketPriceInformation: { amountCents: 37500, priceType: 'PREPAID' },
          communicationPolicy: { canTransfer: true, cancellationPolicyText: 'All sales are final.' },
        },
      ],
      openDate: ['2026-07-03', '2026-07-04', '2026-07-05'],
      openTime: ['17:00', '17:15', '17:30'],
    },
  };

  it('projects experiences with prices, party sizes and policy', () => {
    const a = parseAvailability(calendar)!;
    expect(a.openDates).toHaveLength(3);
    expect(a.openTimes).toContain('17:15');
    expect(a.experiences[0]).toMatchObject({
      name: 'The Salon @ Alinea',
      shortCode: 'SAL',
      minPriceCents: 37500,
      maxPriceCents: 39500,
      priceType: 'PREPAID',
      canTransfer: true,
      partySize: [1, 2, 3, 4, 5, 6],
    });
  });

  it('returns null when offerings are absent', () => {
    expect(parseAvailability({ offerings: null })).toBeNull();
    expect(parseAvailability({})).toBeNull();
  });
});

describe('parseReservations', () => {
  const data = {
    purchases: [
      {
        id: 42,
        business: { name: 'Alinea', domainName: 'alinea' },
        ticketDateTime: '2026-08-01T18:00:00',
        ticketCount: 2,
        ticketType: { name: 'The Salon @ Alinea', variety: 'PRIX_FIXE' },
        city: 'Chicago',
        country: 'US',
        cancelledOrRefunded: false,
      },
    ],
  };

  it('projects GraphQL purchases into reservation summaries', () => {
    const [r] = parseReservations(data);
    expect(r).toMatchObject({
      id: 42,
      venue: 'Alinea',
      venueSlug: 'alinea',
      dateTime: '2026-08-01T18:00:00',
      partySize: 2,
      experience: 'The Salon @ Alinea',
      experienceVariety: 'PRIX_FIXE',
    });
  });

  it('returns [] when there is no purchases array', () => {
    expect(parseReservations({})).toEqual([]);
    expect(parseReservations(null)).toEqual([]);
  });
});

describe('parseAccountIdentity', () => {
  it('reads ownerPatron identity from the first purchase that has it', () => {
    const data = {
      purchases: [
        { id: 1, ownerPatron: { firstName: 'Chris', lastName: 'Hall', email: 'c@example.com', id: 7 } },
      ],
    };
    expect(parseAccountIdentity(data)).toEqual({ firstName: 'Chris', lastName: 'Hall', email: 'c@example.com', id: 7 });
  });

  it('falls back to dinerPatron when ownerPatron is absent', () => {
    const data = { purchases: [{ id: 1, dinerPatron: { firstName: 'Sam', email: 's@example.com', id: 3 } }] };
    expect(parseAccountIdentity(data)).toMatchObject({ firstName: 'Sam', email: 's@example.com' });
  });

  it('returns null when there are no purchases to read identity from', () => {
    expect(parseAccountIdentity({ purchases: [] })).toBeNull();
  });
});
