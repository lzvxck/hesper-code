import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/*
 * This page is the product's only public claim, and nothing else in the repo renders it —
 * the app's other test asserts a rewrite destination. So the copy is read as source text
 * and asserted as words: the risk being guarded is a sentence that a reader can falsify by
 * opening the docs, which no type or render check can see.
 */
const read = (path: string) => readFileSync(join(import.meta.dir, path), "utf8");

// layout.tsx is scanned alongside the page because the <title> and <meta description> there
// carry the same learning claim, and they are the copy that travels furthest from the site.
const COPY = read("../app/page.tsx") + read("../app/layout.tsx");

// Reporting every phrase that hit, rather than asserting one at a time: a failure names
// the offending words instead of dumping the whole page as the received value.
const found = (phrases: RegExp[]) => phrases.filter((phrase) => phrase.test(COPY));

describe("apps/web copy", () => {
  test("makes no claim a reader cannot check", () => {
    expect(
      found([
        /the first/i,
        /the only/i,
        /world's first/i,
        /fully autonomous/i,
        /never forgets/i,
        /zero-config/i,
        /hands-off/i,
        /\bAGI\b/i,
        /superintelligen/i,
      ]),
    ).toEqual([]);
  });

  test("promises nothing for later", () => {
    expect(found([/roadmap/i, /coming soon/i, /stage \d/i, /planned/i, /in the future/i])).toEqual(
      [],
    );
  });

  test("claims nothing this release does not ship", () => {
    expect(
      found([
        /daemon/i,
        /scheduled run/i,
        /unattended/i,
        /cross-session search/i,
        /\bMCP\b/i,
        /plugin/i,
        /sandbox/i,
      ]),
    ).toEqual([]);
  });

  // D7: the gate and the bound are what make the learning claim checkable, so both are pinned.
  // Pinning only the gate let the bound be deleted with the suite still green.
  test("leads with the learning claim, and the gate and bound that hedge it", () => {
    expect(COPY).toContain("learns from its own work");
    expect(COPY).toContain("/memory approve");
    expect(COPY).toContain("bounded");
    expect(COPY).toContain("size budget");
  });
});
