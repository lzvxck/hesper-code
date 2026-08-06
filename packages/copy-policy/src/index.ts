/*
 * What no public page of ours is allowed to say, in one file because it is a company rule and
 * not a page's rule: seriora.ai and seri-agent.seriora.ai have to refuse the same vocabulary.
 *
 * Two copies of these lists drifted inside the single change that introduced them — one site
 * spelled the AGI pattern case-sensitively and the other did not — which is the failure this
 * file exists to make impossible.
 */

export const OVERCLAIMS = [
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

export const FUTURITY = [/roadmap/i, /coming soon/i, /stage \d/i, /planned/i, /in the future/i];

/* Real, but not in the released binary — claiming any of it makes the page falsifiable. */
export const UNSHIPPED = [
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
export const found = (copy: string, patterns: RegExp[]) =>
  patterns.filter((pattern) => pattern.test(copy));

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
};

/*
 * Rendered markup down to what a reader actually sees. Tags go first, so class names and hrefs
 * are never matched as copy; then React's five escapes are undone, without which "world's
 * first" reaches the patterns as "world&#x27;s first" and no apostrophe rule could ever fire.
 * Tags collapse to a space rather than to nothing, so two adjacent elements cannot fuse into a
 * word neither of them says.
 */
export function visibleText(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#x27);/g, (entity) => ENTITIES[entity])
    .replace(/\s+/g, " ")
    .trim();
}
