import { describe, it, expect } from 'vitest';
import { TOCK_VIEWS, viewArg, viewResponse } from '../src/view.js';

/** The serialised text of a tool result — always a single text block here. */
const textOf = (r: ReturnType<typeof viewResponse>): string =>
  (r.content[0] as { text: string }).text;

/**
 * The `view` vocabulary is only worth having if the DEFAULT is the cheap rung.
 * Four sibling repos shipped the projection as opt-in (`compact: false`), and
 * an efficiency a caller has to ask for is one they mostly do not — the caller
 * paying for it being the one least able to know it was on offer. So the first
 * thing pinned here is that omitting `view` strips.
 */
describe('viewResponse', () => {
  const payload = {
    name: 'Alinea',
    profileImageUrl: 'https://images.exploretock.com/v1/signed/alinea-profile',
    heroImageUrl: 'https://images.exploretock.com/v1/signed/alinea-hero',
  };

  it('strips media URLs when no view is given — compact is the DEFAULT rung', () => {
    const out = JSON.parse(textOf(viewResponse(undefined, payload)));
    expect(out).toEqual({ name: 'Alinea' });
  });

  it('strips media URLs on an explicit view: "compact"', () => {
    const out = JSON.parse(textOf(viewResponse('compact', payload)));
    expect(out.profileImageUrl).toBeUndefined();
    expect(out.heroImageUrl).toBeUndefined();
  });

  it('returns EVERYTHING on view: "full" — the escape hatch has to actually escape', () => {
    const out = JSON.parse(textOf(viewResponse('full', payload)));
    expect(out).toEqual(payload);
  });

  /**
   * These two keys are dropped by NAME, not by luck. `MEDIA_KEY` anchors its
   * noun at the start of the key, so neither `profileImageUrl` nor
   * `heroImageUrl` matches it, and the built-in VALUE rule only fires on a URL
   * whose path ends in an image extension. Tock's are signed and
   * extension-less — exactly the case that would silently survive compact if
   * the removal were left to the generic rules.
   */
  it('drops the two Tock media keys even when the URL has no image extension', () => {
    const out = JSON.parse(textOf(viewResponse('compact', {
        profileImageUrl: 'https://images.exploretock.com/v1/abc?sig=deadbeef',
        heroImageUrl: 'https://images.exploretock.com/v1/def?sig=deadbeef',
        webUrl: 'https://www.alinearestaurant.com',
      })));
    expect(out).toEqual({ webUrl: 'https://www.alinearestaurant.com' });
  });

  /**
   * Compact is SUBTRACTIVE — it names what to remove, never what to keep — so
   * a field this repo has never heard of cannot be lost by it. That is the
   * whole reason there is no invented field projection here.
   */
  it('passes an unanticipated field through compact untouched', () => {
    const out = JSON.parse(textOf(viewResponse('compact', { somethingNobodyAnticipated: 42 })));
    expect(out.somethingNobodyAnticipated).toBe(42);
  });

  /**
   * Only FORMATTING whitespace goes. A venue description's blank lines and
   * indentation are content, and a caller reading the description would see
   * the difference; the response text must be byte-identical inside the value.
   */
  it('leaves whitespace INSIDE a value byte-identical, and emits a single line', () => {
    const description = 'Line one.\n\n  Indented line two.\t Tabbed.';
    const text = textOf(viewResponse('compact', { description }));
    expect(JSON.parse(text).description).toBe(description);
    // One line: no pretty-printing. The `\n` above survives as the two-character
    // escape `\\n` in the serialised text, so a real newline would be an indent.
    expect(text.includes('\n')).toBe(false);
  });

  /** A rung this server does not honour must not error — it falls to compact. */
  it('falls back to compact for an unhonoured rung rather than throwing', () => {
    const out = JSON.parse(textOf(viewResponse('raw', payload)));
    expect(out).toEqual({ name: 'Alinea' });
  });
});

describe('viewArg', () => {
  it('offers exactly the rungs this server honours, and is optional', () => {
    expect([...TOCK_VIEWS]).toEqual(['compact', 'full']);
    const schema = viewArg();
    expect(schema.parse(undefined)).toBeUndefined();
    expect(schema.parse('full')).toBe('full');
    expect(() => schema.parse('raw')).toThrow();
  });

  it('documents the rungs on the OPTIONAL wrapper, where a host reads it', () => {
    // `.describe()` applied to the inner enum leaves the wrapper's description
    // blank — a parameter documented to nobody.
    expect(viewArg().description).toContain('compact');
  });
});
