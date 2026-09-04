import { minifiedResult, resolveView, stripMediaUrls, viewParam, type View } from '@chrischall/mcp-utils';

/**
 * The rungs this server honours (`@chrischall/mcp-utils`' `view` vocabulary;
 * `chrischall/workflows` `docs/fleet-conventions.md`, "Response shape").
 *
 * **What compact does here, and what it deliberately does NOT do.**
 *
 * The read tools in this server hand back Tock's payload close to
 * verbatim, and the repo holds no verified record of what those payloads
 * contain — no captured fixture, no documented field list. So nothing here can
 * honestly say which of Tock's fields matter and which are noise.
 *
 * Compact therefore does the one projection that needs no such knowledge: it
 * strips image and avatar URLs. That is SUBTRACTIVE, so it cannot lose a field
 * nobody knew about — the failure an invented field list would risk, where a
 * record comes back with holes in it and reads like a verified answer.
 *
 * When a real payload can be captured, a field projection belongs here beside
 * this one and will save considerably more. Until then this is the honest
 * ceiling, and this docblock says so rather than implying a shape was checked.
 */
export const TOCK_VIEWS = ['compact', 'full'] as const;

const NOTE =
  'compact strips image/avatar URLs from the response; "full" returns Tock\'s payload untouched. ' +
  'No field projection: this server has no verified record of which Tock fields matter, and inventing ' +
  'one would risk dropping a field a caller needs.';

/** The `view` parameter every read tool in this server takes. */
export const viewArg = (): ReturnType<typeof viewParam> => viewParam(TOCK_VIEWS, { note: NOTE });

/**
 * `profileImageUrl` and `heroImageUrl` are named explicitly, and that is what
 * makes their removal DETERMINISTIC rather than accidental.
 *
 * They are the only media fields any parsed shape in this server carries
 * (`parseRestaurant`, `src/parse.ts`), and they are read straight off Tock's
 * own business record — `match.profileImageUrl`, `match.heroImageUrl`. Nothing
 * here derives them, so they are exactly the pass-through CDN URL that
 * `stripMediaUrls` exists to remove: a model cannot see one, cannot fetch one,
 * and gains nothing from carrying one.
 *
 * The built-in rules do NOT catch them. `MEDIA_KEY` anchors its noun at the
 * START of the key, which is the property that keeps `hasThumbnail` alive —
 * and it is also why `profileImageUrl` (starts `profile`) and `heroImageUrl`
 * (starts `hero`) both slip past. That leaves only the VALUE rule, which fires
 * only when the URL's path happens to end in an image extension. A signed or
 * extension-less Tock CDN URL would then survive compact silently, with
 * nothing here to explain why. Naming the two keys removes that dependency on
 * what a URL happens to look like.
 *
 * Nothing is KEPT: this server has no tool whose product is a picture, so
 * there is no payload here that mixes decoration with content.
 */
const DROP = ['profileImageUrl', 'heroImageUrl'] as const;

/**
 * Answer in the requested rung.
 *
 * Only ever called from a READ tool. A write's response is a receipt — an id,
 * a status — with nothing to strip and everything to keep.
 */
export function viewResponse(view: string | undefined, data: unknown): ReturnType<typeof minifiedResult> {
  const rung: View = resolveView(view, TOCK_VIEWS);
  return minifiedResult(rung === 'compact' ? stripMediaUrls(data, { drop: DROP }) : data);
}
