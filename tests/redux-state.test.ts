import { describe, it, expect } from 'vitest';
import { extractReduxSlice, ParseError } from '../src/redux-state.js';

// The slice reader is a thin Tock wrapper over mcp-utils'
// extractJsonKeyAfterMarker (fleet-audit#1130); these pin the behaviour the
// client relies on, against real-shaped stores.
describe('extractReduxSlice', () => {
  // The real Tock store embeds inline `function` values in the `navigation`
  // slice — illegal JSON that breaks a whole-store parse. Slicing by key must
  // sidestep it and still parse the (function-free) slices we read.
  const storeWithFunctions =
    'window.$REDUX_STATE = {' +
    '"navigation":{"onClose":function noop(){return {a:1}},"depth":2},' +
    '"calendar":{"offerings":{"experience":[{"name":"Salon","id":1}],"openDate":["2026-07-10"]}},' +
    '"app":{"business":{"domainName":"alinea","name":"Alinea","jwtToken":undefined}}' +
    '};';

  it('extracts a named slice past a navigation slice full of function literals', () => {
    const cal = extractReduxSlice(storeWithFunctions, 'calendar') as any;
    expect(cal.offerings.experience[0].name).toBe('Salon');
    expect(cal.offerings.openDate).toEqual(['2026-07-10']);
  });

  it('sanitizes undefined inside the sliced value', () => {
    const app = extractReduxSlice(storeWithFunctions, 'app') as any;
    expect(app.business).toMatchObject({ domainName: 'alinea', jwtToken: null });
  });

  it('extracts a slice that appears after the function-bearing one', () => {
    // 'app' is declared last, so this proves the scan skips the navigation
    // functions rather than choking on them.
    expect(extractReduxSlice(storeWithFunctions, 'app')).toBeTruthy();
  });

  it('handles escaped quotes and braces inside string values', () => {
    const html = `<script>window.$REDUX_STATE = {"desc":"a \\"quoted\\" } brace","x":{"y":[1,{"z":true}]}};</script>`;
    expect(extractReduxSlice(html, 'desc')).toBe('a "quoted" } brace');
    expect(extractReduxSlice(html, 'x')).toEqual({ y: [1, { z: true }] });
  });

  it('coerces bare undefined to null but leaves the word inside strings alone', () => {
    const html = `window.$REDUX_STATE = {"s":{"jwtToken":undefined,"arr":[undefined,2],"note":"undefined stays a string"}};`;
    expect(extractReduxSlice(html, 's')).toEqual({ jwtToken: null, arr: [null, 2], note: 'undefined stays a string' });
  });

  it('returns a legitimate null slice (a signed-out patron) rather than treating it as missing', () => {
    expect(extractReduxSlice('window.$REDUX_STATE = {"patron":null,"app":{}};', 'patron')).toBeNull();
  });

  it('only matches a top-level key, never a same-named key nested in a sibling', () => {
    const html = 'window.$REDUX_STATE = {"nav":{"calendar":"decoy"},"calendar":{"real":true}};';
    expect(extractReduxSlice(html, 'calendar')).toEqual({ real: true });
  });

  it('tolerates whitespace around the key colon', () => {
    const html = 'window.$REDUX_STATE = { "calendar" : {"ok":1} };';
    expect(extractReduxSlice(html, 'calendar')).toEqual({ ok: 1 });
  });

  it('throws ParseError naming the marker when the store is absent', () => {
    expect(() => extractReduxSlice('<html>no state here</html>', 'app')).toThrow(/\$REDUX_STATE marker not found/);
  });

  it('throws ParseError when the requested slice is absent', () => {
    expect(() => extractReduxSlice(storeWithFunctions, 'patron')).toThrow(ParseError);
    expect(() => extractReduxSlice(storeWithFunctions, 'patron')).toThrow(/Slice "patron"/);
  });

  it('throws ParseError on an unterminated store', () => {
    expect(() => extractReduxSlice('window.$REDUX_STATE = {"a":{"b":1', 'a')).toThrow(ParseError);
  });
});
