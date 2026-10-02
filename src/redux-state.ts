/**
 * Extract data from the `window.$REDUX_STATE` store embedded in a Tock
 * (exploretock.com) server-rendered HTML page.
 *
 *   window.$REDUX_STATE = { "app": {...}, "consumerPage": {...}, ... };
 *
 * The store is a JS *object literal*, not strict JSON:
 *   - absent values are the bare identifier `undefined`
 *     (e.g. `"jwtToken":undefined`), and
 *   - at least one slice (`navigation`) embeds inline `function` values.
 * Both are illegal JSON, so the whole blob can't be `JSON.parse`d. Instead one
 * named top-level slice is read with mcp-utils' `extractJsonKeyAfterMarker`
 * (hoisted from this file's old hand-rolled walker, fleet-audit#1130), which
 * skips sibling values as arbitrary JS and repairs `undefined` before parsing.
 * The slices we read (consumerPage, calendar, metroArea, patron) are
 * function-free; slicing by key sidesteps the `navigation` functions.
 *
 * What stays here is Tock's contract: which markers name the store, and a
 * `ParseError` that says which step failed instead of a silent `undefined`.
 */
import { extractJsonKeyAfterMarker } from '@chrischall/mcp-utils/scrape';

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

const MARKERS = ['window.$REDUX_STATE', '"$REDUX_STATE"', '$REDUX_STATE'];

/**
 * Extract one named top-level slice of the store (e.g. `'consumerPage'`,
 * `'calendar'`, `'metroArea'`). Returns the parsed value — `null` included, a
 * signed-out `"patron":null` is a real answer — or throws ParseError when the
 * store or the key is absent, or the slice is not parseable.
 */
export function extractReduxSlice(html: string, key: string): unknown {
  if (!MARKERS.some((m) => html.includes(m))) {
    throw new ParseError('$REDUX_STATE marker not found in HTML');
  }
  const value = extractJsonKeyAfterMarker(html, MARKERS, key, { sanitize: true });
  if (value === undefined) {
    throw new ParseError(
      `Slice "${key}" not found in $REDUX_STATE (absent, unterminated, or not valid JSON)`
    );
  }
  return value;
}
