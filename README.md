# tock-mcp

MCP server for **Tock** ([exploretock.com](https://www.exploretock.com)) — restaurant discovery and availability for Claude. List cities, search a metro, and get a venue's details plus its bookable experiences, prices, party sizes, and open dates/times.

Every request is relayed through your own signed-in browser tab via the [fetchproxy](https://github.com/chrischall/fetchproxy) extension — no cookie paste, no bot-wall dance, no password handling. This project was developed and is maintained by AI (Claude Code).

> Tock publishes no official consumer API, and exploretock.com sits behind a Cloudflare challenge. tock-mcp fetches the same server-rendered pages the Tock web app uses (parsing their embedded `window.$REDUX_STATE` store) through your signed-in tab. It is **read-only** — Tock reservations are prepaid tickets, so booking stays on exploretock.com. Use at your own discretion.

## Install

```json
// .mcp.json
{
  "mcpServers": {
    "tock": { "command": "npx", "args": ["-y", "tock-mcp"] }
  }
}
```

You also need the [fetchproxy browser extension](https://github.com/chrischall/fetchproxy) (shared across the fleet) running in a Chrome/Safari tab. The first tool call prints a one-time pair code to approve in the extension popup — run `tock_healthcheck` to trigger it. Discovery works signed-out; the account tools need you signed in to exploretock.com.

## Tools

- **`tock_list_metros`** — Tock cities/metros with business counts; filter by name/country.
- **`tock_search_restaurants`** — venues in a metro slug (cuisine, price, neighborhood, slug).
- **`tock_get_restaurant`** — venue details + its bookable experiences.
- **`tock_get_availability`** — a venue's bookable calendar (experiences, prices, open dates/times).
- **`tock_list_reservations`** / **`tock_get_profile`** — the signed-in user's purchases and profile.
- **`tock_healthcheck`** — bridge status + the one-time pair code.

## Develop

```bash
npm install
npm run build     # tsc + esbuild bundle → dist/bundle.js
npm test          # vitest
```

Architecture and the reverse-engineered Tock surface are documented in [`docs/TOCK-API.md`](docs/TOCK-API.md).

## License

MIT
