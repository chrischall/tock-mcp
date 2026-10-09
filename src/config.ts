// Boot-time config for tock-mcp: the (testing-only) TOCK_WS_PORT override and
// the startup banner that reports the port actually in use.
import { readEnvVar, readIntEnv, type EnvSource } from '@chrischall/mcp-utils';
import { DEFAULT_PORT } from './transport-fetchproxy.js';

const PORT_ENV = 'TOCK_WS_PORT';

/**
 * Resolve the TOCK_WS_PORT override. Returns `undefined` (use the shared
 * fetchproxy port) when unset, or when set to something that is not an integer
 * in 1-65535 — in which case `warn` is told so the typo doesn't fail silently.
 */
export function resolveWsPort(
  env: EnvSource = process.env,
  warn: (msg: string) => void = (msg) => console.error(msg)
): number | undefined {
  const port = readIntEnv(PORT_ENV, { env, min: 1, max: 65_535 });
  if (port === undefined) {
    const raw = readEnvVar(PORT_ENV, { env });
    if (raw !== undefined) {
      warn(
        `[tock-mcp] ignoring ${PORT_ENV}=${JSON.stringify(raw)}: not an integer in 1-65535; ` +
          `using the default port ${DEFAULT_PORT}.`
      );
    }
  }
  return port;
}

/** Startup banner, naming the port the bridge will actually bind. */
export function buildBanner(version: string, port: number | undefined): string {
  return (
    `[tock-mcp] v${version} — WebSocket bridge via @fetchproxy/server on 127.0.0.1:${port ?? DEFAULT_PORT}. ` +
    'Install ContextMint Bridge (see https://github.com/nullnet-app/contextmint-bridge/releases) ' +
    'and sign in at exploretock.com. First request prints a one-time pair code to ' +
    'approve in the extension. This project was developed and is maintained by AI.'
  );
}
