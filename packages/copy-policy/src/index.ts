/*
 * What no public page of ours is allowed to say, in one file because it is a company rule and
 * not a page's rule: seriora.ai and seri-agent.seriora.ai have to refuse the same vocabulary.
 *
 * Two copies of these lists drifted inside the single change that introduced them — one site
 * spelled the AGI pattern case-sensitively and the other did not — which is the failure this
 * file exists to make impossible.
 */

import { expect } from "bun:test";

const OVERCLAIMS = [
  /the first/i,
  /the only/i,
  /world's first/i,
  /fully autonomous/i,
  /never forgets/i,
  /zero-config/i,
  /hands-off/i,
  // Word-bounded because /agi/i matches "magic", which the lab copy uses. The boundary is what
  // excludes it — measured: /\bAGI\b/i does not match "more magic." — so the /i costs nothing
  // and still catches a lowercased spelling.
  /\bAGI\b/i,
  /superintelligen/i,
];

/*
 * `\bsoon\b` rather than `coming soon`, which it subsumes: "landing soon" and "soon you will
 * be able to" are the same promise and neither was caught. Deliberately NOT `will be` — the
 * portal legitimately says "Nothing more will be charged."
 */
const FUTURITY = [/roadmap/i, /\bsoon\b/i, /stage \d/i, /planned/i, /in the future/i];

/*
 * DELETE THIS AT LAUNCH. It exists only for the holding page the three sites serve while the
 * agent is not available (loop `coming-soon-holding`, branch `coming-soon-holding`), and the
 * intended way it goes away is reverting that PR — which removes the three /holding routes,
 * the three proxy branches and this mask together. An exemption that outlives its reason is
 * precisely the failure this package exists to prevent, so it is written to be found.
 *
 * The hole is bounded three ways, not one.
 *
 * By phrase: an exact two-word match with word boundaries, not a loosening of `\bsoon\b`.
 * By list: masked out on the FUTURITY line only, so OVERCLAIMS and UNSHIPPED still scan the
 * unmasked copy and "Coming soon — the first fully autonomous agent" fails on both claims it
 * makes. Bare `soon` still fires — "available soon" and "landing soon" are rejected as before.
 * By SURFACE: callers opt in with `{ allowComingSoon: true }` and the default is off, so the
 * three holding cases get it and the lab and web homepage cases — which call `assertClean` the
 * same way and go through the same function — do not. Without the opt-in the marketing
 * homepages could say "Coming soon" with both suites green, which is wider than the holding
 * page asks for and wider than the precedent this follows (the prior loop scoped its one
 * futurity exception by surface and exact phrase rather than by loosening a pattern).
 *
 * The replacement is a space rather than the empty string so that removing the phrase cannot
 * fuse the words on either side of it into one the page never said.
 */
const COMING_SOON = /\bcoming soon\b/gi;

/* Real, but not in the released binary — claiming any of it makes the page falsifiable. */
const UNSHIPPED = [
  /daemon/i,
  /scheduled run/i,
  /unattended/i,
  /cross-session search/i,
  /\bMCP\b/i,
  /plugin/i,
  /sandbox/i,
];

// Reporting every phrase that hit, rather than asserting one at a time: a failure names the
// offending words instead of dumping the whole page as the received value.
const found = (copy: string, patterns: RegExp[]) =>
  patterns.filter((pattern) => pattern.test(copy));

/*
 * The whole policy in one assertion, so the two sites' suites cannot drift the way the lists
 * they check did. They already had: apps/web asserted FUTURITY and UNSHIPPED as two tests and
 * apps/lab combined them into one, each under its own copy of the same preamble with a clause
 * changed. What belongs in an app's own test file is what is structural to that page.
 *
 * Pass rendered markup run through `textNodes`, not page source. Reading page.tsx as text
 * scanned its code comments as if they were copy, in both directions: a comment holding the
 * pinned phrases kept a suite green while the JSX underneath had been deleted, and a comment
 * that merely mentioned an OS sandbox turned it red while nothing on the page said so.
 *
 * PRECONDITION on rendering, and the reason it is not blanket coverage of a page:
 * `renderToStaticMarkup` produces the INITIAL render and nothing else. Copy a client component
 * only shows after an interaction is simply not in the string — Radix's Tabs renders no closed
 * TabsContent, which is how apps/web shipped two install commands and two platform notes that
 * no pattern here was ever tested against. A caller whose page hides copy that way has to feed
 * it in itself, as apps/web now does with InstallTabs' PLATFORMS. The other edge: the same
 * function throws outright on an async server component, so this technique has a real boundary
 * — every page it is used on today is sync.
 *
 * `allowComingSoon` defaults to false so the four existing call sites keep their exact
 * behaviour without being edited; only the three holding cases pass it. See COMING_SOON above
 * for why the exemption is scoped by surface and not only by phrase.
 */
export function assertClean(copy: string, { allowComingSoon = false } = {}): void {
  expect(found(copy, OVERCLAIMS)).toEqual([]);
  expect(found(allowComingSoon ? copy.replace(COMING_SOON, " ") : copy, FUTURITY)).toEqual([]);
  expect(found(copy, UNSHIPPED)).toEqual([]);
}

/*
 * React's five escapes, and the pattern that finds them, from one list.
 *
 * They used to be two hand-maintained lists that had to agree — an alternation spelling the
 * names and a table keyed by them — with `Record<string, string>` typing every lookup as
 * `string` and `noUncheckedIndexedAccess` off in all three app tsconfigs, so a name in the
 * alternation with no row in the table type-checked and spliced the word "undefined" into the
 * copy under test. Measured on the old code: `"a&nbsp;b"` scanned with `&nbsp;` added to the
 * alternation only came back `"aundefinedb"`.
 *
 * `as const satisfies` is what makes the index a union of the five keys rather than `string`,
 * and the cast below is sound because the pattern is built from those same keys.
 */
const ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
} as const satisfies Record<string, string>;

// No key holds a regex metacharacter, so the alternation is the keys verbatim. One pass over
// the string rather than one pass per entity, so `&amp;lt;` decodes to `&lt;` and not to `<`.
const ENTITY = new RegExp(Object.keys(ENTITIES).join("|"), "g");

/*
 * Rendered markup down to its text nodes. Tags go first, so class names and hrefs are never
 * matched as copy; then React's five escapes are undone, without which "world's first" reaches
 * the patterns as "world&#x27;s first" and no apostrophe rule could ever fire. Tags collapse to
 * a space rather than to nothing, so two adjacent elements cannot fuse into a word neither of
 * them says.
 *
 * Text nodes are all it reads, and the name says so rather than promising visible copy: an
 * attribute is invisible to it (InstallTabs.tsx ships an aria-label no pattern here will ever
 * see) and a raw-text element is not (a <style> body saying `.roadmap { }` would trip FUTURITY
 * with nothing on the page saying it). Neither case exists on these pages; a page that grows
 * one needs this function changed, not worked around at the call site.
 */
export function textNodes(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(ENTITY, (entity) => ENTITIES[entity as keyof typeof ENTITIES])
    .replace(/\s+/g, " ")
    .trim();
}
