// Pure projections over Tock $REDUX_STATE slices. Each parser walks the slice
// for the array/record it needs (keyed off documented fields only) so it
// degrades gracefully when Tock reshuffles the surrounding CMS/widget tree —
// the fleet's "walk for the shape, don't hard-code the path" discipline.
//
// Slice sources (see docs/TOCK-API.md):
//   - metros     ← 'app' slice on /city
//   - listings   ← 'consumerPage' slice on /city/{metro}
//   - venue      ← 'app' slice on /{slug}
//   - offerings  ← 'calendar' slice on /{slug}[/search]
//   - patron     ← 'patron' / 'app'.patron on /profile

/* eslint-disable @typescript-eslint/no-explicit-any */
type Obj = Record<string, any>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null;
}

/** Depth-first collect every array whose items match `pred`. */
function collectArrays(root: unknown, pred: (item: Obj) => boolean): Obj[][] {
  const out: Obj[][] = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown): void => {
    if (!isObj(node) || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      if (node.length && isObj(node[0]) && pred(node[0] as Obj)) {
        out.push(node as Obj[]);
      }
      for (const item of node) walk(item);
      return;
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(root);
  return out;
}

/** Depth-first find the first object matching `pred`. */
function findObject(root: unknown, pred: (o: Obj) => boolean): Obj | null {
  const seen = new Set<unknown>();
  let found: Obj | null = null;
  const walk = (node: unknown): void => {
    if (found || !isObj(node) || seen.has(node)) return;
    seen.add(node);
    if (!Array.isArray(node) && pred(node)) {
      found = node;
      return;
    }
    const values = Array.isArray(node) ? node : Object.values(node);
    for (const v of values) walk(v);
  };
  walk(root);
  return found;
}

// ---- metros ---------------------------------------------------------------

export interface Metro {
  name: string;
  slug: string;
  state?: string;
  country?: string;
  businessCount: number;
  isActive?: boolean;
  isFeatured?: boolean;
  timezone?: string;
  currencyCode?: string;
  lat?: number;
  lng?: number;
  id?: number;
}

const isMetro = (o: Obj): boolean =>
  typeof o.slug === 'string' &&
  typeof o.name === 'string' &&
  typeof o.businessCount === 'number';

export function parseMetros(appSlice: unknown): Metro[] {
  const arrays = collectArrays(appSlice, isMetro);
  // Pick the largest matching array (the global directory), dedupe by slug.
  const best = arrays.sort((a, b) => b.length - a.length)[0] ?? [];
  const bySlug = new Map<string, Metro>();
  for (const m of best) {
    if (bySlug.has(m.slug)) continue;
    bySlug.set(m.slug, {
      name: m.name,
      slug: m.slug,
      state: m.state || undefined,
      country: m.country || undefined,
      businessCount: m.businessCount,
      isActive: m.isActive,
      isFeatured: m.isFeatured,
      timezone: m.timezone || undefined,
      currencyCode: m.currencyCode || undefined,
      lat: m.lat,
      lng: m.lng,
      id: m.id,
    });
  }
  return [...bySlug.values()];
}

// ---- restaurant listings (search) -----------------------------------------

export interface RestaurantSummary {
  slug: string; // domainName → exploretock.com/{slug}
  name: string;
  cuisines?: string;
  priceRange?: string;
  businessType?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  country?: string;
  webUrl?: string;
  description?: string;
  location?: Obj;
}

const isBusiness = (o: Obj): boolean =>
  typeof o.domainName === 'string' && typeof o.name === 'string';

function toSummary(b: Obj): RestaurantSummary {
  return {
    slug: b.domainName,
    name: b.name,
    cuisines: b.cuisines || undefined,
    priceRange: b.priceRange || undefined,
    businessType: b.businessType || undefined,
    neighborhood: b.neighborhood || undefined,
    city: b.city || undefined,
    state: b.state || undefined,
    country: b.country || undefined,
    webUrl: b.webUrl || undefined,
    description: b.description || undefined,
    location: isObj(b.location) ? b.location : undefined,
  };
}

export function parseListings(consumerPageSlice: unknown): RestaurantSummary[] {
  const arrays = collectArrays(consumerPageSlice, isBusiness);
  const bySlug = new Map<string, RestaurantSummary>();
  for (const arr of arrays) {
    for (const b of arr) {
      if (!bySlug.has(b.domainName)) bySlug.set(b.domainName, toSummary(b));
    }
  }
  return [...bySlug.values()];
}

// ---- venue details --------------------------------------------------------

export interface RestaurantDetails extends RestaurantSummary {
  profileImageUrl?: string;
  heroImageUrl?: string;
  timeZone?: string;
  currencyCode?: string;
  locale?: string;
}

/**
 * Extract the venue's own business record from the 'app' slice of a /{slug}
 * page. Prefers the record whose domainName matches `slug`; falls back to the
 * sole record that carries cuisine/price + a name.
 */
export function parseRestaurant(
  appSlice: unknown,
  slug?: string
): RestaurantDetails | null {
  const match = findObject(
    appSlice,
    (o) =>
      isBusiness(o) &&
      (slug ? o.domainName === slug : o.cuisines != null || o.priceRange != null)
  );
  if (!match) return null;
  return {
    ...toSummary(match),
    profileImageUrl: match.profileImageUrl || undefined,
    heroImageUrl: match.heroImageUrl || undefined,
    timeZone: match.timeZone || undefined,
    currencyCode: match.currencyCode || undefined,
    locale: match.locale || undefined,
  };
}

// ---- availability / offerings ---------------------------------------------

export interface Experience {
  id?: number;
  name: string;
  slug?: string;
  shortCode?: string;
  type?: string;
  description?: string;
  state?: string;
  currencyCode?: string;
  partySize?: number[];
  minPriceCents?: number;
  maxPriceCents?: number;
  priceType?: string;
  canTransfer?: boolean;
  cancellationPolicy?: string;
}

export interface Availability {
  experiences: Experience[];
  openDates: string[];
  openTimes: string[];
}

function toExperience(e: Obj): Experience {
  const pricePer = isObj(e.pricePerPerson) ? e.pricePerPerson : {};
  const ticket = isObj(e.ticketPriceInformation) ? e.ticketPriceInformation : {};
  const comm = isObj(e.communicationPolicy) ? e.communicationPolicy : {};
  return {
    id: e.id,
    name: e.name,
    slug: e.slug || undefined,
    shortCode: e.shortCode || undefined,
    type: e.type || undefined,
    description: e.description || undefined,
    state: e.state || undefined,
    currencyCode: e.currencyCode || undefined,
    partySize: Array.isArray(e.partySize) ? e.partySize : undefined,
    minPriceCents: typeof pricePer.minCents === 'number' ? pricePer.minCents : undefined,
    maxPriceCents: typeof pricePer.maxCents === 'number' ? pricePer.maxCents : undefined,
    priceType: ticket.priceType || undefined,
    canTransfer: typeof comm.canTransfer === 'boolean' ? comm.canTransfer : undefined,
    cancellationPolicy: comm.cancellationPolicyText || undefined,
  };
}

/**
 * Read a venue's bookable calendar from the 'calendar' slice. `offerings`
 * carries the experiences plus the union of open dates/times; the UI filters
 * these client-side (there is no per-date availability API). `onDate`, when
 * given, filters openTimes to that date only if the store scopes them — Tock
 * returns a single union list, so we return all openTimes and let the caller
 * present them with the openDates.
 */
export function parseAvailability(calendarSlice: unknown): Availability | null {
  if (!isObj(calendarSlice)) return null;
  const offerings = (calendarSlice as Obj).offerings;
  if (!isObj(offerings)) return null;
  const experiences = Array.isArray(offerings.experience)
    ? (offerings.experience as Obj[]).map(toExperience)
    : [];
  return {
    experiences,
    openDates: Array.isArray(offerings.openDate) ? offerings.openDate : [],
    openTimes: Array.isArray(offerings.openTime) ? offerings.openTime : [],
  };
}

// ---- reservations / profile (GraphQL `purchases`) -------------------------

export interface Reservation {
  id?: number;
  venue?: string;
  venueSlug?: string;
  dateTime?: string;
  partySize?: number;
  experience?: string;
  experienceVariety?: string;
  city?: string;
  state?: string;
  country?: string;
  cancelledOrRefunded?: boolean;
}

export interface AccountIdentity {
  firstName?: string;
  lastName?: string;
  email?: string;
  id?: number;
}

/** Project one GraphQL `purchases` item into a slim reservation summary. */
export function toReservation(p: Obj): Reservation {
  const business = isObj(p.business) ? p.business : {};
  const ticket = isObj(p.ticketType) ? p.ticketType : {};
  return {
    id: p.id,
    venue: business.name || undefined,
    venueSlug: business.domainName || undefined,
    dateTime: p.ticketDateTime || undefined,
    partySize: typeof p.ticketCount === 'number' ? p.ticketCount : undefined,
    experience: ticket.name || undefined,
    experienceVariety: ticket.variety || undefined,
    city: p.city || undefined,
    state: p.state || undefined,
    country: p.country || undefined,
    cancelledOrRefunded:
      typeof p.cancelledOrRefunded === 'boolean' ? p.cancelledOrRefunded : undefined,
  };
}

/** Map a `{ purchases: [...] }` GraphQL payload to reservation summaries. */
export function parseReservations(data: unknown): Reservation[] {
  const purchases =
    isObj(data) && Array.isArray((data as Obj).purchases)
      ? ((data as Obj).purchases as Obj[])
      : [];
  return purchases.map(toReservation);
}

/**
 * Derive the account holder's identity from a `purchases` payload. Tock has no
 * standalone profile GraphQL query; each purchase carries `ownerPatron`
 * (the account holder) and `dinerPatron`. Returns null when no purchase is
 * present to read identity from.
 */
export function parseAccountIdentity(data: unknown): AccountIdentity | null {
  const purchases =
    isObj(data) && Array.isArray((data as Obj).purchases)
      ? ((data as Obj).purchases as Obj[])
      : [];
  for (const p of purchases) {
    const owner = isObj(p.ownerPatron) ? p.ownerPatron : isObj(p.dinerPatron) ? p.dinerPatron : null;
    if (owner && (owner.email || owner.firstName)) {
      return {
        firstName: owner.firstName || undefined,
        lastName: owner.lastName || undefined,
        email: owner.email || undefined,
        id: owner.id,
      };
    }
  }
  return null;
}
