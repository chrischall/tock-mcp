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
> prepaid or deposit (which add a Stripe/Turnstile step). A booking flow would
> refuse any offering that isn't free; see "Why booking/cancel are NOT
> implemented" at the end of this section for why no booking flow ships at all.

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

The lock **response** (octet-stream) returns a **cart id** that becomes
`60020.3` in the price/confirm message. It is **per-lock**, not stable — two
bookings of the same experience produced two different, adjacent ids. So the
confirm cannot be built from public/offering data alone; it needs the live lock
response.

### Step 2 — price check: `POST /api/ticket/price/consumer`
Same field-`60020` message as the confirm (below), returned with the computed
price (0 for a free reservation). A UI pre-flight; the confirm is authoritative.

### Step 3 — confirm the booking (creates the reservation)
`POST` (octet-stream) with the field-`60020` message. Observed ~735 bytes:

```
60020 (msg) {
  3: cartId              // varint — the per-lock id from the lock RESPONSE
  4: experienceId        // varint, e.g. 202361
  5: 0                   // varint
  6 (msg) {              // per-ticket quantities
    1: 0
    2: partySize         // count of standard tickets
    3: 0
  }
  8 (msg) {              // guest / diner block — ALL sourced from /api/patron/profile
    1: patron.id             // varint
    2: patron.email          // string
    3: patron.firstName      // string
    4: patron.lastName       // string
    5: patron.phone          // string
    6: patron.zipCode        // string
    7: 0
    8: patron.uuid           // string, 36-char UUID
    10: patron.imageUrl      // string (the ~98-byte field is the avatar URL, NOT an address)
    11: patron.isoCountryCode    // string, 2 chars ("US")
    12: patron.phoneCountryCode  // string ("+1 US")
    13..21: 0
    22: <string, ~20 chars>  // one field not yet mapped
  }
  10: 0
  11: <fixed32>
  ...                    // trailing scalars (not fully mapped)
}
```

`GET /api/patron/profile` returns this guest data as **clean JSON**
(`result.patron.{id,email,firstName,lastName,phone,zipCode,uuid,imageUrl,
isoCountryCode,phoneCountryCode}`). No Stripe/Turnstile field appears for a free
reservation — the free path posts a plain octet-stream and succeeds with no card.

### Step 4 — cancel: from `/profile/reservations/<purchaseId>/cancel`
A protobuf write keyed by `purchaseId` (the id in the reservation-detail URL).
"Effective immediately" for free/cancelable offerings. (Exact endpoint/bytes not
cleanly captured — the request tears down on the post-cancel navigation.)

### Idempotency / duplicate behaviour (observed)
Re-running the confirm with a **stale** cart id (re-entering the flow after a
prior booking) is a **silent no-op**: Tock renders the post-booking "Enable text
alerts" modal from cached checkout state but creates **no** reservation and
returns **no** error. So "the modal appeared" is NOT proof a booking exists —
a fresh lock is required per booking, and success must be confirmed by re-read.

### Verification is slow: the reservations API lags the UI
Tock's GraphQL `purchases` query lags the Reservations *tab* by minutes-to-longer
for same-session activity — a just-canceled reservation showed in the UI's
Canceled tab while `purchases(CANCELED)` still returned empty. Verify a
book/cancel by re-reading the reservation-detail page
(`/profile/reservations/<id>`), which shows "Reservation canceled" authoritatively.

## Why booking/cancel are NOT implemented (a hard safety boundary)

Every `/api/ticket/*` request authenticates with app-injected **`X-Tock-*`
request headers** — not cookies. A **byte-identical** lock replay carrying only
cookies + `Content-Type` returns `{2:{1:1002, 2:"Unknown business identifier",
5:404}}`. The real requests add (captured as *names only*):

| header | role |
| --- | --- |
| `x-tock-authorization` | **session auth secret** |
| `x-tock-session` | **session secret** |
| `x-tock-fingerprint` | **anti-bot device fingerprint** |
| `x-tock-path` | business/page context (e.g. `/iogodfrey`) — non-secret |
| `x-tock-scope` | `consumer` — non-secret |
| `x-tock-build-number`, `x-tock-metro-area-id`, `x-tock-experimentvariantlist`, `x-tock-stream-format` | non-secret |

These headers are set by the app's JS HTTP interceptor from in-page state — a
plain `fetch`, **including a fetchproxy in-tab fetch**, does not carry them
(fetchproxy only rides the browser's cookies). So any automated `tock_book`
would have to either **read and forward the user's live session tokens**
(credential harvesting) or **reconstruct `x-tock-fingerprint`** (bot-detection
bypass). Both are boundaries this project does not cross, so the write tools are
**not shippable** — the protocol above is documented as proven-feasible for the
record, and the MCP stays read-only.

Everything else needed is solved and safe: the offering-type gate
(`priceType`/price), the guest block (`/api/patron/profile`, plain JSON), the
`businessId` (in the SSR store), and the wire codec (`src/protobuf.ts`, which
encodes the lock message to the exact 30 bytes seen on the wire). The last mile —
and only the last mile — is the anti-bot/session header gate.

## Header hints (from the `explore.js` bundle, structure only — no values captured)
Authenticated app requests carry `X-Tock-Authorization`, `X-Tock-Session`,
`X-Tock-Csrf-Token`, `X-Tock-Build-Number`, `X-Tock-Scope`,
`X-Tock-Stream-Format`, etc. We don't set these — the in-tab bridge fetch runs
with the browser's own cookies/session, and SSR HTML needs none of them.
