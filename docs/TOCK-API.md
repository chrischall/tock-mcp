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

### `/profile`, `/account` — the signed-in patron (needs a logged-in tab)
Returns a `$REDUX_STATE` even when signed out, with `app.patron: null`. When
signed in, the `patron` slice carries `purchaseHistory`, `purchaseSummaries`,
`wishlist`, etc. `get_reservations` / `get_profile` parse this; when `patron` is
null / absent they throw `SessionNotAuthenticatedError` (open a signed-in
exploretock.com tab). `/reservations` and `/user` 302 to login when signed out.

> Not verified against a signed-in session (would require entering the user's
> password, which is off-limits). The parsers degrade gracefully: they read the
> documented `patron.purchaseHistory` / `patron.purchaseSummaries` fields and
> return what's present, warning to stderr if the shape has drifted.

## Booking (writes) — out of scope for v1
Tock reservations are overwhelmingly **PREPAID tickets** (Stripe `pk_live_…` in
`__ENV__`, Turnstile-gated checkout). A booking write means driving Stripe +
Turnstile + a real charge — too much surface and irreversible spend for a first
cut. v1 is read-only (discover / search / venue / availability / profile).

## Header hints (from the `explore.js` bundle, structure only — no values captured)
Authenticated app requests carry `X-Tock-Authorization`, `X-Tock-Session`,
`X-Tock-Csrf-Token`, `X-Tock-Build-Number`, `X-Tock-Scope`,
`X-Tock-Stream-Format`, etc. We don't set these — the in-tab bridge fetch runs
with the browser's own cookies/session, and SSR HTML needs none of them.
