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

## Booking / cancel — the protobuf transaction protocol (reverse-engineered)

The booking/checkout/cancel *transaction* does **not** use GraphQL. It's a
stateful flow of **protobuf** requests (`application/octet-stream`) against
`/api/ticket/*`. Protobuf wire format is self-describing (field number + wire
type), so the messages decode without a schema; the shapes below were captured
live from a real net-zero booking (book + immediate cancel) at a free venue.

> **Offering-type gate.** Only offerings whose `ticketPriceInformation.priceType`
> is **not** `PREPAID`/`DEPOSIT` and whose per-person price is 0 can be booked
> without a card. In practice that's a small slice — many Tock venues are
> prepaid or deposit (which add a Stripe/Turnstile step this MCP does NOT drive).
> `tock_book` therefore refuses any offering that isn't free.

### Wire types used
`0` = varint (ints/enums), `2` = length-delimited (strings + nested messages).
Field tags below are `<field#>`.

### Step 1 — lock a slot: `PUT /api/ticket/group/lock`
Reserves the timeslot for a few minutes. Request (~30 bytes):

```
60051 (msg) {
  1: partySize        // varint, e.g. 2
  2: "YYYY-MM-DDTHH:MM" // local datetime string, e.g. "2026-07-15T14:30"
  3: experienceId     // varint, e.g. 202361 (the /experience/<id>/ segment)
  6: 0                // varint (seating/area? observed 0)
}
```
Response: octet-stream (holds the lock). The UI then shows a "holding for M:SS"
countdown at `/<slug>/checkout/options`.

### Step 2 — price check: `POST /api/ticket/price/consumer`
Same message shape as the booking confirm (below), returned with the computed
price. For a free reservation the price is 0. Optional to replicate — it's a
pre-flight the UI runs; the confirm is authoritative.

### Step 3 — confirm the booking (creates the reservation)
`POST` (octet-stream) with the field-`60020` message. Observed ~735 bytes with
the full guest+address block:

```
60020 (msg) {
  3: <ticketTypeToken>   // varint; STABLE per experience (identical across two
                         //   separate bookings of the same experience 10+ min
                         //   apart) — sourced from the offering, NOT a per-lock
                         //   nonce. (Working hypothesis; see "gaps" below.)
  4: experienceId        // varint, e.g. 202361
  5: 0                   // varint
  6 (msg) {              // per-ticket quantities
    1: 0                 // varint
    2: partySize         // varint (e.g. 1) — count of standard tickets
    3: 0                 // varint
  }
  8 (msg) {              // guest / diner block
    1: patronId          // varint
    2: "email"           // string
    3: "firstName"       // string
    4: "lastName"        // string
    5: "phone"           // string, e.g. "555-555-1234"
    6: "zip"             // string, e.g. "60614"
    7: 0                 // varint
    8: "<uuid>"          // string, 36-char UUID (idempotency/request id)
    10: "<address>"      // string (~street; ~98 bytes observed)
    11: "<state>"        // string, 2 chars
    12: "<zip5>"         // string, 5 chars
    13..21: 0            // varints
    22: "<token>"        // string, ~20 chars
  }
  10: 0
  11: <fixed32>
  ...                    // trailing scalars (not fully mapped)
}
```

The guest block is **account data** (name, email, phone, zip, address) — sourced
from the signed-in patron, not user input. No Stripe/Turnstile field appears for
a free reservation (confirmed: the free path posts a plain octet-stream and
succeeds with no card).

### Step 4 — cancel: from `/profile/reservations/<purchaseId>/cancel`
A protobuf `POST`/`PUT` keyed by `purchaseId` (the id in the reservation-detail
URL). Cancellation is "effective immediately" for free/cancelable offerings.

### Idempotency / duplicate behaviour (observed)
Re-running the confirm with a **stale** field-`3` token (e.g. re-entering the
flow after a prior booking) is a **silent no-op**: Tock renders the
post-booking "Enable text alerts" modal from cached checkout state but creates
**no** new reservation and returns **no** error. So a fresh lock per booking is
required, and "the modal appeared" is NOT proof a reservation exists — verify by
re-reading (see freshness caveat below).

### Verification is slow: the reservations API lags the UI
Tock's GraphQL `purchases` query (and to a lesser extent the SSR list) can lag
the Reservations *tab* by minutes for same-session activity — a just-canceled
reservation showed in the UI's Canceled tab while `purchases(CANCELED)` still
returned empty. So `tock_book`/`tock_cancel` verify by re-reading the
reservation-detail page (`/profile/reservations/<id>`), not the list query.

### Known gaps (why this stays confirm-gated + free-only)
- The **confirm endpoint path** was redacted in capture (the request tears down
  on the post-booking navigation); the message shape is known, the exact path is
  pinned at build time from a send-time capture.
- The **cancel** request bytes weren't cleanly captured (same teardown); cancel
  is driven by `purchaseId` and verified by re-read.
- Field `60020.3`'s exact source (offering field vs lock response) is a working
  hypothesis. Because a wrong value silently no-ops rather than erroring,
  `tock_book` re-reads to confirm a reservation actually landed.

## Header hints (from the `explore.js` bundle, structure only — no values captured)
Authenticated app requests carry `X-Tock-Authorization`, `X-Tock-Session`,
`X-Tock-Csrf-Token`, `X-Tock-Build-Number`, `X-Tock-Scope`,
`X-Tock-Stream-Format`, etc. We don't set these — the in-tab bridge fetch runs
with the browser's own cookies/session, and SSR HTML needs none of them.

## Header hints (from the `explore.js` bundle, structure only — no values captured)
Authenticated app requests carry `X-Tock-Authorization`, `X-Tock-Session`,
`X-Tock-Csrf-Token`, `X-Tock-Build-Number`, `X-Tock-Scope`,
`X-Tock-Stream-Format`, etc. We don't set these — the in-tab bridge fetch runs
with the browser's own cookies/session, and SSR HTML needs none of them.
