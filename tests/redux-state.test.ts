import { describe, it, expect } from 'vitest';
import { extractReduxState, extractReduxSlice, ParseError } from '../src/redux-state.js';

describe('extractReduxState', () => {
  it('extracts a window.$REDUX_STATE assignment', () => {
    const html = `<html><script>window.$REDUX_STATE = {"app":{"a":1},"n":2};</script></html>`;
    expect(extractReduxState(html)).toEqual({ app: { a: 1 }, n: 2 });
  });

  it('handles nested objects and escaped strings/braces in string values', () => {
    const html = `<script>window.$REDUX_STATE = {"desc":"a \\"quoted\\" } brace","x":{"y":[1,{"z":true}]}};</script>`;
    expect(extractReduxState(html)).toEqual({
      desc: 'a "quoted" } brace',
      x: { y: [1, { z: true }] },
    });
  });

  it('stops at the matching close brace, ignoring trailing script', () => {
    const html = `window.$REDUX_STATE = {"only":1};\nwindow.__ENV__ = {"other":2};`;
    expect(extractReduxState(html)).toEqual({ only: 1 });
  });

  it('coerces bare `undefined` value literals to null (Tock serialises absent values that way)', () => {
    const html = `window.$REDUX_STATE = {"jwtToken":undefined,"n":1,"arr":[undefined,2],"note":"undefined stays a string"};`;
    expect(extractReduxState(html)).toEqual({
      jwtToken: null,
      n: 1,
      arr: [null, 2],
      note: 'undefined stays a string',
    });
  });

  it('throws ParseError when the marker is absent', () => {
    expect(() => extractReduxState('<html>no state here</html>')).toThrow(ParseError);
  });

  it('throws ParseError on unmatched braces', () => {
    expect(() => extractReduxState('window.$REDUX_STATE = {"a":1')).toThrow(ParseError);
  });
});

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

  it('throws ParseError when the requested slice is absent', () => {
    expect(() => extractReduxSlice(storeWithFunctions, 'patron')).toThrow(ParseError);
  });
});
