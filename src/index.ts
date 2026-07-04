#!/usr/bin/env node
// tock-mcp entrypoint.
//
// Tock (exploretock.com) sits behind a Cloudflare managed challenge, so every
// read is relayed through the user's signed-in browser tab via the fetchproxy
// bridge (@fetchproxy/server on 127.0.0.1:37149 — the shared fleet port the
// fetchproxy browser extension dials). An in-tab fetch returns the full
// server-rendered HTML; we parse the embedded window.$REDUX_STATE store.
//
// Boot sequence:
//   1. Build the FetchproxyTransport (lazy-binds the port on first request).
//   2. TockClient.start() brings the transport up.
//   3. runMcp() registers tools, prints the banner, wires SIGINT/SIGTERM →
//      client.close(), and connects stdio.
//
// The transport is built in the caller so the server still boots (and answers
// tools/list) when the bridge/extension isn't up yet — the error surfaces on
// the first tool call.
import { runMcp, readEnvVar } from '@chrischall/mcp-utils';
import { registerBridgeHealthcheckTool } from '@chrischall/mcp-utils/fetchproxy';
import { VERSION } from './version.js';
import { TockClient } from './client.js';
import { FetchproxyTransport } from './transport-fetchproxy.js';
import { registerDiscoverTools } from './tools/discover.js';
import { registerRestaurantTools } from './tools/restaurants.js';
import { registerAccountTools } from './tools/account.js';

const wsPort = readEnvVar('TOCK_WS_PORT');
const transport = new FetchproxyTransport({
  port: wsPort ? Number(wsPort) : undefined,
  version: VERSION,
});

const client = new TockClient({ transport });
await client.start();

const banner =
  `[tock-mcp] v${VERSION} — WebSocket bridge via @fetchproxy/server on 127.0.0.1:37149. ` +
  'Install the fetchproxy extension (see https://github.com/chrischall/fetchproxy) ' +
  'and sign in at exploretock.com. First request prints a one-time pair code to ' +
  'approve in the extension. This project was developed and is maintained by AI.';

await runMcp({
  name: 'tock-mcp',
  version: VERSION,
  banner,
  deps: client,
  tools: [
    registerDiscoverTools,
    registerRestaurantTools,
    registerAccountTools,
    (server) =>
      registerBridgeHealthcheckTool({
        server,
        prefix: 'tock',
        probePath: '/robots.txt',
        hostLabel: 'www.exploretock.com',
        transport: transport.bridge,
        probeFn: (path) => client.fetchHtml(path),
      }),
  ],
  shutdown: { onSignal: () => client.close() },
});
