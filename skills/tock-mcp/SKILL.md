---
name: tock-mcp
description: Discover restaurants on Tock (exploretock.com) via MCP — list cities, search a metro, and get a venue's details plus its bookable experiences, prices, party sizes, and open dates/times. Triggers on phrases like "search Tock for", "what's on Tock in Chicago", "find a Tock reservation at", "does Alinea have availability on Tock", "what experiences does <venue> offer on Tock", or "my Tock reservations". Requires tock-mcp installed and the fetchproxy browser extension running in a signed-in exploretock.com tab.
---

# tock-mcp

MCP server for Tock (exploretock.com) — restaurant discovery and availability. Every request is relayed through the user's signed-in browser tab via the [fetchproxy](https://github.com/chrischall/fetchproxy) extension, so there's no cookie paste, no bot-wall dance, and no password handling.

- **npm:** [npmjs.com/package/tock-mcp](https://www.npmjs.com/package/tock-mcp)
- **Source:** [github.com/chrischall/tock-mcp](https://github.com/chrischall/tock-mcp)

> Tock does not publish an official consumer API, and exploretock.com sits behind a Cloudflare challenge. This server fetches the same server-rendered pages the Tock web app uses (parsing their embedded `window.$REDUX_STATE` store) through your own signed-in browser tab. It is **read-only**: Tock reservations are prepaid tickets, so booking is left to exploretock.com. Use at your own discretion.

## Setup

The MCP server is half of the picture — the other half is the [fetchproxy](https://github.com/chrischall/fetchproxy) browser extension that talks to Tock from your signed-in tab. Both are required.

### 1. Install the MCP server

Add to `.mcp.json` in your project or `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "tock": {
      "command": "npx",
      "args": ["-y", "tock-mcp"]
    }
  }
}
```

Or from source:

```bash
git clone https://github.com/chrischall/tock-mcp
cd tock-mcp
npm install && npm run build
# then point .mcp.json at dist/bundle.js
```

### 2. Install the fetchproxy extension

tock-mcp shares a single browser extension with every other fetchproxy-based MCP. Install it once from [github.com/chrischall/fetchproxy](https://github.com/chrischall/fetchproxy), then open **exploretock.com** and sign in (only needed for the account tools; discovery works signed-out).

### 3. Approve the one-time pair code

The first tool call prints a pair code to approve in the Transporter extension popup (trust-on-first-use, per identity). Run `tock_healthcheck` to trigger it, approve the code, and you're paired for good.

## Tools

| Tool | What it does |
| --- | --- |
| `tock_list_metros` | List Tock cities/metros (name, slug, business count). Filter by name/country. |
| `tock_search_restaurants` | List / search venues in a metro slug (cuisine, price, neighborhood, slug). |
| `tock_get_restaurant` | Venue details + its bookable experiences (prices, party sizes). |
| `tock_get_availability` | A venue's bookable calendar: experiences, prices, open dates/times. |
| `tock_list_reservations` | The signed-in user's purchases / reservations (needs a signed-in tab). |
| `tock_get_profile` | The signed-in user's profile (needs a signed-in tab). |
| `tock_healthcheck` | Round-trip the bridge; reports status + the pair code on first run. |

## Typical flow

1. `tock_list_metros { query: "chicago" }` → find the metro slug.
2. `tock_search_restaurants { metro: "chicago", query: "tasting menu" }` → get venue slugs.
3. `tock_get_availability { slug: "alinea", date: "2026-07-10", party_size: 2 }` → see experiences and open dates/times.
4. To book, open `exploretock.com/<slug>` — reservations are prepaid tickets and are completed on Tock.

## Notes

- **Read-only.** No booking, cancelling, or payment — Tock reservations are prepaid/Turnstile-gated checkouts left to the site.
- **Discovery needs no login.** Only `tock_list_reservations` / `tock_get_profile` require a signed-in exploretock.com tab.
- Errors are actionable: a Cloudflare challenge asks you to clear it in the signed-in tab; a signed-out account tool asks you to sign in.
