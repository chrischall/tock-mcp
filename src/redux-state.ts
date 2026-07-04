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
 * Both are illegal JSON, so we can't `JSON.parse` the whole blob. Instead we
 * pull out one named top-level slice by walking braces/strings to its value's
 * matching close, then sanitise the `undefined` literals inside it before
 * `JSON.parse`. The slices we read (consumerPage, calendar, metroArea, patron)
 * are function-free; slicing by key sidesteps the `navigation` functions.
 */

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}

const MARKERS = ['window.$REDUX_STATE', '"$REDUX_STATE"', '$REDUX_STATE'];

/** Locate the store's opening `{` in the HTML. Returns the index of `{`. */
function findStoreStart(html: string): number {
  let idx = -1;
  let markerLen = 0;
  for (const m of MARKERS) {
    const i = html.indexOf(m);
    if (i >= 0) {
      idx = i;
      markerLen = m.length;
      break;
    }
  }
  if (idx < 0) throw new ParseError('$REDUX_STATE marker not found in HTML');
  let start = idx + markerLen;
  while (start < html.length && html[start] !== '{') start++;
  if (start >= html.length) {
    throw new ParseError('Could not locate start of $REDUX_STATE JSON');
  }
  return start;
}

/**
 * Consume one JS value starting at `src[start]` (which may be `{`, `[`, `"`, or
 * a scalar) and return the index just past its end. String- and escape-aware;
 * matches nested braces/brackets.
 */
function consumeValue(src: string, start: number): number {
  const ch = src[start];
  if (ch === '{' || ch === '[') {
    const open = ch;
    const close = ch === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (inString) {
        if (c === '\\') escape = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) return i + 1;
      }
    }
    throw new ParseError('Unmatched brackets in $REDUX_STATE value');
  }
  if (ch === '"') {
    let escape = false;
    for (let i = start + 1; i < src.length; i++) {
      const c = src[i];
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') return i + 1;
    }
    throw new ParseError('Unterminated string in $REDUX_STATE value');
  }
  // scalar: number / true / false / null / undefined — up to the next
  // structural delimiter.
  let i = start;
  while (i < src.length && !/[,}\]]/.test(src[i])) i++;
  return i;
}

/**
 * Extract one named top-level slice of the store (e.g. `'consumerPage'`,
 * `'calendar'`, `'metroArea'`). Returns the parsed value, or throws
 * ParseError if the key is absent.
 */
export function extractReduxSlice(html: string, key: string): unknown {
  const storeStart = findStoreStart(html);
  const needle = `"${key}":`;
  // Scan for the key at depth 1 of the store object.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = storeStart; i < html.length; i++) {
    const c = html[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      if (depth === 1 && html.startsWith(needle, i)) {
        const valStart = i + needle.length;
        const valEnd = consumeValue(html, valStart);
        const raw = sanitizeJsLiterals(html.slice(valStart, valEnd));
        try {
          return JSON.parse(raw) as unknown;
        } catch (err) {
          throw new ParseError(
            `Failed to parse $REDUX_STATE slice "${key}": ${(err as Error).message}`
          );
        }
      }
      inString = true;
    } else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) break; // end of store object — key not found
    }
  }
  throw new ParseError(`Slice "${key}" not found in $REDUX_STATE`);
}

/**
 * Parse the whole store. Only safe on pages whose store has no `function`
 * values (i.e. not the `navigation` slice) — prefer extractReduxSlice for
 * real pages. Kept for tests and simple fixtures.
 */
export function extractReduxState(html: string): Record<string, unknown> {
  const start = findStoreStart(html);
  const end = consumeValue(html, start);
  const json = sanitizeJsLiterals(html.slice(start, end));
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch (err) {
    throw new ParseError(
      `Failed to parse $REDUX_STATE JSON: ${(err as Error).message}`
    );
  }
}

/**
 * Replace bare `undefined` value tokens (outside string literals) with `null`.
 * String-aware, so the word "undefined" inside a string value is untouched.
 */
function sanitizeJsLiterals(src: string): string {
  let out = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      out += ch;
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === 'u' && src.startsWith('undefined', i)) {
      const prev = out.replace(/\s+$/, '').slice(-1);
      const after = src[i + 'undefined'.length];
      const boundedAfter = after === undefined || /[\s,}\]]/.test(after);
      if ((prev === ':' || prev === ',' || prev === '[') && boundedAfter) {
        out += 'null';
        i += 'undefined'.length - 1;
        continue;
      }
    }
    out += ch;
  }
  return out;
}
