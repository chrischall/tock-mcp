/**
 * Context-group hints, published on each tool as `_meta.mint` (mcp-host's
 * `mintHintSchema`, the context-groups contract). Inert data: a host that does
 * not read them sees an extra `_meta` key and nothing else. The shape is fixed
 * by the host's contract, so it is restated here rather than imported — this
 * server takes no dependency on mcp-host.
 *
 * Every tool here is in the `food` group. `subject` and `when` would name THIS
 * tool's own argument names, never values — and none is declared: a Tock
 * account is one person's, so there is no listable set of subjects, and the
 * reservations list takes no date range. `aliases` are lowercase, at most 8,
 * each at most 40 chars: the words a person says, not tool names.
 */
export type MintIntent =
  | 'whats-new' | 'whats-due' | 'whats-on' | 'lookup' | 'turn-on-off' | 'send' | 'change' | 'other';

export interface MintHint {
  domain: 'food';
  intent: MintIntent;
  canonical?: true;
  subject?: string;
  when?: { start: string; end: string };
  aliases?: string[];
}

/** `_meta` for a Tock tool. */
export function foodMeta(
  intent: MintIntent,
  extra: Omit<MintHint, 'domain' | 'intent'> = {},
): { mint: MintHint } {
  return { mint: { domain: 'food', intent, ...extra } };
}
