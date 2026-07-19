# tock-mcp

Read-only MCP server for Tock (exploretock.com): metro directory, per-metro
restaurant search, venue detail, a venue's bookable calendar, and the signed-in
user's reservations. Seven `tock_*` tools, stdio, no env config.

**Archetype: Pattern A** (every call rides the fetchproxy bridge — see
`docs/fleet-conventions.md` in `chrischall/workflows` for what A vs B means).
Pattern A is forced here, not chosen: `www.exploretock.com` answers *every*
server-side path — `/`, `/city`, `/{slug}` — with `403` + `cf-mitigated:
challenge` + a "Just a moment…" interstitial. There is no login form to POST, no
consumer token exchange, and nothing to lift out of the browser and replay from
Node. The same-origin `fetch(path, {credentials:'include'})` inside the user's
tab returns the full SSR HTML with no challenge. That in-tab fetch *is* the
transport.

`src/transport-fetchproxy.ts` declares `domains: ['exploretock.com']` (one
domain; subdomains match the declared root) and pins `subdomain: 'www'` on every
request. Port 37149 is the shared fleet concentrator — `TOCK_WS_PORT` overrides
it for local testing only; changing the default means the extension never
connects.

## Build & test

```bash
npm run build   # tsc → dist/*.js + esbuild → dist/bundle.js (the bin entry)
npm test        # vitest, 8 files / 61 tests, fully mocked, no bridge needed
```

`tests/helpers.ts` exports `stubClient({ slices, html, graphql, errors })` — a
hand-rolled `TockClient` stub keyed by `"path::sliceKey"`. Tool tests drive that;
they never touch a transport. `tests/server-boot.test.ts` spawns the real
`dist/bundle.js` with no `node_modules` and asserts the `tools/list` handshake —
it builds on demand, so a stale `dist/` won't fail it silently.

`vitest.config.ts` has **no** `exclude` for `**/.claude/**` or `**/dist/**`. If
you leave an agent worktree under `.claude/worktrees/`, its tests get discovered
too.

## The SSR store is a JS object literal, not JSON

Every consumer page embeds `window.$REDUX_STATE = {…}`. Two things make it
illegal JSON:

- absent values are the bare identifier `undefined` (e.g. `"jwtToken":undefined`)
- the `navigation` slice embeds inline `function` values

So **never parse the whole store.** `extractReduxSlice(html, key)` (in
`src/redux-state.ts`) walks braces/strings to one named top-level slice, then
rewrites bare `undefined` → `null` before `JSON.parse`. Slicing by key is what
sidesteps `navigation`'s functions. `extractReduxState()` (whole-store) is kept
for fixtures only — it will throw on a real page.

The slices in use: `app` (metro directory on `/city`; the business record on
`/{slug}`), `consumerPage` (listings on `/city/{metro}`), `calendar` (offerings
on `/{slug}`).

Business listings are buried in a CMS/widget tree
(`…variant.N.template.widget.M.content.business`). `src/parse.ts` therefore
**walks for the shape, never the path** — `collectArrays` finds arrays whose
items have `domainName` + `name`; metros are arrays whose items have `slug` +
`name` + numeric `businessCount` (largest match wins, deduped by slug). Keep new
parsers in that style; a hard-coded path breaks on the next CMS reshuffle.

## Response-shape quirks worth knowing before you design a tool

- **Availability is a union, not a per-date answer.** `calendar.offerings`
  carries `openDate[]` and `openTime[]` as unions across *all* experiences. The
  Tock UI filters client-side; there is no per-date availability API to call.
  `/{slug}/search?date=…` returns the same store re-centered, and the
  `availability` slice stays `isInitialized:false`. So `tock_get_availability`
  can honestly report `dateOpen` (is the date in `openDate[]`) but **cannot**
  say which times exist on that date. Don't add a tool that implies it can.
- **`/profile` SSR is a decoy.** It does embed a `$REDUX_STATE`, but `patron`
  has `purchaseHistory: null` / `purchaseSummaries: []` even when signed in —
  the data is lazy-loaded post-hydration. Parsing the store for reservations
  returns empty, not an error.
- **Authenticated reads go through GraphQL with the op name in the path:**
  `POST /api/graphql/<Op>?opname=<Op>`, JSON body, clean JSON back. Only
  `PatronReservationHistory` is pinned (`src/graphql-ops.ts`, query text verbatim
  from the web app). Live-verified 2026-07-05; CI mocks the client, so re-verify
  against a real 200 before treating it as still true.
- **Tock has no profile query.** `tock_get_profile` derives identity from
  `ownerPatron` on a purchase, so a signed-in account with zero reservations
  yields a deliberate `McpToolError` rather than a fabricated profile. That is
  the designed outcome, not a bug to route around.
- **`/api/consumer/*` is protobuf**, not JSON — a JSON body gets `415`. It only
  drives autocomplete. The SSR store already has everything, so we don't call it.

## Writes are deliberately not shippable — don't "finish" them

`docs/TOCK-API.md` documents the full reverse-engineered booking protocol
(lock → price → confirm, protobuf over `/api/ticket/*`), and `src/protobuf.ts`
is a working wire codec that encodes the lock message to the exact 30 bytes seen
live. It ships **unused, on purpose.**

Every `/api/ticket/*` request authenticates with app-injected `X-Tock-*` headers
— `x-tock-authorization` (session auth secret), `x-tock-session`, and
`x-tock-fingerprint` (anti-bot device fingerprint) — set by the app's in-page JS
interceptor. A fetchproxy in-tab fetch carries the browser's **cookies only**,
not those headers; a byte-identical cookie-only replay of the lock returns
`{1002, "Unknown business identifier", 404}`. Completing booking would require
either reading and forwarding the user's live session tokens (credential
harvesting) or reconstructing the fingerprint (bot-detection bypass). Both are
out of bounds. Everything *else* is solved — the codec, the offering-type gate,
the guest block from `GET /api/patron/profile` (plain JSON) — which is exactly
why this boundary needs restating rather than rediscovering.

Two related traps recorded from the live capture, in case a future probe
revisits this: a confirm replayed with a **stale cart id** is a silent no-op
that still renders the post-booking modal (the modal is not proof of a booking),
and the GraphQL `purchases` query lags the Reservations tab by minutes, so a
single immediate re-read proves nothing.

**UNVERIFIED:** step 4 (cancel) was never cleanly captured — the request tears
down on the post-cancel navigation, so its endpoint and bytes in
`docs/TOCK-API.md` are inferred. Field `22` of the guest block is unmapped.

## Landmine: the next release will fail its publish job

This repo ships **two** skills — `skills/tock-mcp/SKILL.md` (MCP usage) and
`skills/tock-fpx/SKILL.md` (fpx/CLI tier) — and there is no root `SKILL.md`.
`chrischall/workflows`' `mcp-publish` action resolves the skill as: explicit
`skill-path` → root `SKILL.md` → *exactly one* `skills/*/SKILL.md`; two or more
is `exit 1`. `.github/workflows/release-please.yml` passes **no** `skill-path`.

Verified 2026-07-19: at v0.2.0 the action still only looked for a root
`SKILL.md`, so it printed "SKILL.md not present — skipping skill packaging" and
the release shipped with **no `.skill` asset and no ClawHub publish** — silently.
The action has since gained the `skills/*/` resolution *with* the hard failure,
so the next release will die in the publish job **after** the tag and GitHub
Release already exist. Pin `skill-path: skills/tock-mcp/SKILL.md` before cutting
the next release.

## Versioning

`src/version.ts` is the single source (`// x-release-please-version`); every
other manifest is a JSON `extra-file` in `release-please-config.json`.
`tests/version-sync.test.ts` fails CI on drift. `server.json`'s description is
96 chars against a 100-char registry cap — check `jq -r '.description|length'`
before editing it.

<!-- pr-workflow:v3 -->
## Pull requests & release notes

Fleet policy — Conventional-Commit PR titles, labels, the auto-review /
auto-merge ladder, auto-review follow-up issues, PR timing, and release PRs —
lives in `~/.claude/CLAUDE.md`. Don't restate it here; the copies drifted.

Shared technical conventions (publishing, bundling, versioning guards,
write-verification, transport archetypes, testing traps) live in
[`chrischall/workflows`](https://github.com/chrischall/workflows):
`docs/fleet-conventions.md`, plus `README.md` for the CI pipeline contract.

Repo-specific: `ci.yml` runs the gate in **status mode** — an un-armed PR is
blocked by a yellow `ci-gated` commit status rather than a red job, and the
repo ruleset requires the `ci-gated` context (not `ci / ci`). A PR that looks
"pending forever" is un-armed, not broken.
