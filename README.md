# tock-mcp

MCP server for **Tock** ([exploretock.com](https://www.exploretock.com)) — restaurant discovery and availability for Claude. List cities, search a metro, and get a venue's details plus its bookable experiences, prices, party sizes, and open dates/times.

Every request is relayed through your own signed-in browser tab via the [ContextMint Bridge](https://github.com/nullnet-app/contextmint-bridge/releases) browser extension — no cookie paste, no bot-wall dance, no password handling. This project was developed and is maintained by AI (Claude Code).

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

You also need **ContextMint Bridge** (the browser extension shared by every fetchproxy-based MCP), installed from [its releases page](https://github.com/nullnet-app/contextmint-bridge/releases): in Chrome, unzip the chrome zip and load it unpacked (`chrome://extensions` → Developer mode → Load unpacked). Safari isn't available yet (it will ship inside the ContextMint app, which has no public download), so use Chrome for now. ContextMint Bridge is the fetchproxy browser extension under its new name, from the same maintainer — fetchproxy's own README (https://github.com/chrischall/fetchproxy#extension) points to it. Its source is public at https://github.com/nullnet-app/contextmint-bridge: build it yourself, or check a release zip against the `.sha256` file published beside it (`shasum -a 256 -c contextmint-bridge-chrome-<version>.zip.sha256`). Keep an exploretock.com tab open. The first tool call prints a one-time pair code to approve in the ContextMint Bridge popup — run `tock_healthcheck` to trigger it. Discovery works signed-out; the account tools need you signed in to exploretock.com.

## Environment

No environment variables are required. These optional knobs mirror the `.mcpb` manifest's settings:

| Variable | Default | Purpose |
|---|---|---|
| `TOCK_WS_PORT` | `37149` | Concentrator port for the fetchproxy browser bridge. Every fetchproxy MCP on one machine shares the concentrator, so move it for all of them or none (mainly for local testing, or a hosted registration's bridge port). |
| `FETCHPROXY_WS_HOST` | `127.0.0.1` | Bridge bind interface, a literal IP only (anything else is ignored). Keep on loopback; it exists for a hosted child in its own network namespace. |
| `FETCHPROXY_IDENTITY_DIR` | `~/.fetchproxy/identity/` | Where the bridge's long-term identity keypair is stored, an absolute path only (anything else is ignored). For a host that runs a separate child per caller. |

## Tools

- **`tock_list_metros`** — Tock cities/metros with business counts; filter by name/country.
- **`tock_search_restaurants`** — venues in a metro slug (cuisine, price, neighborhood, slug).
- **`tock_get_restaurant`** — venue details + its bookable experiences.
- **`tock_get_availability`** — a venue's bookable calendar (experiences, prices, open dates/times).
- **`tock_list_reservations`** / **`tock_get_profile`** — the signed-in user's purchases and profile.
- **`tock_verify_reservation`** — after a booking attempt, re-query the account and return an explicit `confirmed` / `cancelled` / `not_found` / `ambiguous` verdict. A success screen is not proof; this is.
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
