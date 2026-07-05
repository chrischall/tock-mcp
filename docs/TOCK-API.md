# Tock (exploretock.com) consumer surface — reverse-engineered notes

**Archetype: full fetchproxy.** `www.exploretock.com` sits behind a Cloudflare
managed challenge — a plain server-side `GET` returns `403` +
`cf-mitigated: challenge` + a `<title>Just a moment...</title>` interstitial for
every path, including `/` and `/city/*`. There is no server-side login form and
no consumer token exchange. So every read goes through the user's signed-in
browser tab via `@fetchproxy/server` (port 37149, domain `exploretock.com`,
subdomain `www`), exactly like `opentable-mcp`. An **in-tab** `fetch(path,
{credentials:'include'})` returns the full SSR HTML with **no challenge** — this
is what the bridge issues.

## The data lives in the SSR Redux store, not in client XHR

Every consumer page is server-rendered with the entire dataset embedded as a JS
assignment in the HTML:

```
window.$REDUX_STATE = { "app": {...}, "consumerPage": {...}, "calendar": {...}, ... };
```

Parse it the same way `opentable-mcp` parses `__INITIAL_STATE__`: find the
`window.$REDUX_STATE` marker, walk from the first `{` matching braces/strings to
the close, `JSON.parse`. (There is also `window.__ENV__ = {...}` with public
config — `API_BASE`, Stripe public key, etc. — not needed for reads.)

The client-side JSON API (`POST /api/consumer/...`) is **protobuf** (a JSON body
returns `415 Unsupported Media Type`) and drives autocomplete only. We do **not**
use it — the SSR store already carries search results, venue details, and the
full bookable calendar.

## Pages we fetch and what they carry

### `/city` — global metro directory
`$REDUX_STATE` contains an array of ~253 metros, each:
`{ name, slug, state, country, businessCount, isActive, isFeatured, lat, lng, timezone, currencyCode, id, ... }`.
Detected as the array whose items have `slug` + `name` + numeric `businessCount`.
Slugs like `chicago`, `london`, `new-york`. Many have `businessCount: 0` (inactive).

### `/city/{slug}` (optionally `?query={q}`) — metro discovery / search results
`$REDUX_STATE.consumerPage.consumerPage` is a widget/CMS tree. Business listings
live in arrays nested under `…variant.N.template.widget.M.content.business`.
Detect them as arrays whose items have `domainName` + `name`. Each business:

```
{
  domainName,          // the Tock page slug → exploretock.com/{domainName}
  name, description,
  cuisines,            // e.g. "Contemporary American"
  priceRange,          // "$$$$"
  businessType,        // "Restaurant" | "Winery" | ...
  city, state, country,
  neighborhood,        // e.g. "West Loop"
  webUrl,              // the venue's own website
  timeZone, currencyCode, locale,
  location: { address, city, state, country, zipCode, lat, lng, id },
  profileImageUrl, heroImageUrl, isTockUnlisted
}
```
`?query=` filters the same structure server-side. A bare `/search?query=X`
redirects to `/city/{detectedMetro}?query=X`, so we require a metro slug.

### `/{domainName}` — venue detail + bookable calendar
- `$REDUX_STATE.calendar.offerings` — the bookable calendar, populated server-side:
  ```
  {
    createdAt,
    experience: [ {
        id, name, slug, shortCode,   // e.g. "The Salon @ Alinea" / "SAL"
        description, type,           // "PRIX_FIXE"
        currencyCode,
        partySize: [1,2,3,4,5,6],
        pricePerPerson: { minCents, maxCents },
        ticketPriceInformation: { amountCents, priceType },  // "PREPAID"
        state,                       // "AVAILABLE"
        communicationPolicy: { canTransfer, cancellationPolicyText },
        eventDetails: { location: { address, city, state, zipCode, lat, lng, name } }
    }, ... ],
    openDate: ["2026-07-03", ...],   // all dates the venue has any offering
    openTime: ["17:00","17:15", ...],// all times across offerings
    privateExperienceId: [ ... ]
  }
  ```
  This is the whole availability picture: which experiences, their prices/party
  sizes, and the union of open dates/times. The UI filters these client-side by
  the selected date — there is no per-date availability API to call.

### `/{domainName}/search?date=YYYY-MM-DD&size=N&time=HH:MM` — date-centered view
Same `calendar.offerings` store, centered on `date`. Used by `get_availability`.
`availability` slice stays uninitialized (`isInitialized:false`) — slots render
from `offerings`, not from that slice.

### `/profile`, `/account` — signed-in, but the data is NOT in the SSR store
The signed-in `/profile` page **does** embed a `$REDUX_STATE`, but its `patron`
slice has `purchaseHistory: null` / `purchaseSummaries: []` — the reservation
data is **lazy-loaded client-side after hydration** (note the
`isPurchaseHistoryInitialized` flags). So parsing the SSR store for reservations
returns empty even when signed in. The authenticated reads use the GraphQL API
below instead.

## Authenticated reads use a GraphQL API (clean JSON)
Signed-in data flows through Tock's GraphQL endpoint, with the operation name in
the **path**:

```
POST /api/graphql/<OperationName>?opname=<OperationName>
Content-Type: application/json
{ "operationName": "<OperationName>", "variables": {…}, "query": "<document>" }
→ 200 { "data": {…} }        // or { "errors": [{message}] }
```

The bridge fetches this from the signed-in tab (cookies attached). A `401`/`403`
or an `errors` entry mentioning auth ⇒ `SessionNotAuthenticatedError`.

- **`PatronReservationHistory`** — the reservations list.
  Variables `{ offset: Int!, limit: Int!, selection: String! }`, `selection ∈
  {UPCOMING, PAST, CANCELED}`. Returns `data.purchases[]`, each with
  `business { name, domainName, … }`, `ticketDateTime`, `ticketCount`,
  `ticketType { name, variety, … }`, `city/country`, `cancelledOrRefunded`,
  `ownerPatron`/`dinerPatron { firstName, lastName, email, id }`. **Verified live**
  (`tock_list_reservations`; `tock_get_profile` derives identity from
  `ownerPatron`). The full query document is pinned in `src/graphql-ops.ts`.

The main JS bundle defines only a handful of GraphQL ops (reservation history,
waitlist, `CreatePaymentCardSetupIntent`) — there is **no** booking/cancel
mutation in GraphQL.

## Booking / cancel (writes) — not implemented, and not practical
The actual booking/checkout/cancel *transaction* does **not** use GraphQL — it
goes through the protobuf `/api/consumer/*` endpoints (`application/octet-stream`,
opaque binary). Building a write would mean reverse-engineering the protobuf
message schema per operation. On top of that:

- Every bookable offering costs money. Offerings are `PREPAID` (Stripe charge),
  `DEPOSIT` (card hold), or `FREE` — and in a ~50-venue sample across NYC /
  Chicago / SF the only `FREE` one was a **prepaid pickup** (you still pay for
  the goods). There is essentially **no free, no-card inventory** to verify a
  write against net-zero.
- Checkout is **Turnstile**-gated and payment is **Stripe** (`pk_live_…` in
  `__ENV__`).

So this MCP is read-only: discover / search / venue / availability, plus the
authenticated GraphQL reads (reservations, profile). Booking stays on
exploretock.com.

## Header hints (from the `explore.js` bundle, structure only — no values captured)
Authenticated app requests carry `X-Tock-Authorization`, `X-Tock-Session`,
`X-Tock-Csrf-Token`, `X-Tock-Build-Number`, `X-Tock-Scope`,
`X-Tock-Stream-Format`, etc. We don't set these — the in-tab bridge fetch runs
with the browser's own cookies/session, and SSR HTML needs none of them.
