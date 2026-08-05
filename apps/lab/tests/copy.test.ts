import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "bun:test";

/*
 * Nothing in this repo renders React, and apps/lab had no test at all, so a copy edit here
 * was caught by nothing. This reads the page as source text and pins the claims it is not
 * allowed to make, plus the one structural property the copy depends on.
 */
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

const PAGE = read("../app/page.tsx");

// The vocabulary rules cover layout.tsx too: the <title> and <meta description> make the same
// kind of claim and travel furthest from the site. The structural assertions below stay on
// PAGE alone — they are about how this page is built.
const COPY = PAGE + read("../app/layout.tsx");

const OVERCLAIMS = [
  /the first/i,
  /the only/i,
  /world's first/i,
  /fully autonomous/i,
  /never forgets/i,
  /zero-config/i,
  /hands-off/i,
  // Case-sensitive and word-bounded on purpose: /agi/i matches "magic", which the copy uses.
  /\bAGI\b/,
  /superintelligen/i,
];

const FUTURITY = [/roadmap/i, /coming soon/i, /stage \d/i, /planned/i, /in the future/i];

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

describe("seriora.ai copy", () => {
  test("makes no claim it cannot back", () => {
    for (const pattern of OVERCLAIMS) expect(COPY).not.toMatch(pattern);
  });

  test("promises nothing that has not shipped", () => {
    for (const pattern of FUTURITY) expect(COPY).not.toMatch(pattern);
    for (const pattern of UNSHIPPED) expect(COPY).not.toMatch(pattern);
  });

  test("leads with the research thesis", () => {
    expect(PAGE).toContain("An independent research lab");
    expect(PAGE).toContain("We study agents that improve themselves.");
  });

  /*
   * The hero, the problem, the open problems and the principles have to read the same way
   * if the lab ships a second product, so the only place a product name may appear is the
   * PRODUCTS array, the URLs it points at, and the package imports. Those three are cut out
   * rather than allow-listed, and each cut is asserted to have removed something — a strip
   * pattern that quietly stops matching would leave this test passing while checking nothing.
   */
  test("names no product outside the products array", () => {
    const cuts = [
      PAGE.match(/const PRODUCTS = \[[\s\S]*?\n\];/g),
      PAGE.match(/const \w+_URL = "[^"]*";/g),
      PAGE.match(/import [^;]*from "[^"]*";/g),
    ];

    let rest = PAGE;
    for (const cut of cuts) {
      expect(cut).not.toBeNull();
      for (const match of cut!) rest = rest.replace(match, "");
    }

    // "Seriora" is the lab itself, not a product, and does not match \bseri\b.
    expect(rest).not.toMatch(/\bseri\b/i);
  });

  test("puts the products in a grid that takes a second entry unchanged", () => {
    const grid = PAGE.match(/<ul className="([^"]*)">\s*\{PRODUCTS\.map/);
    expect(grid).not.toBeNull();
    expect(grid![1]).toContain("md:grid-cols-2");
  });
});
