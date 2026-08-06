import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, test } from "bun:test";

import { assertClean, textNodes } from "@seri/copy-policy";
import { metadata } from "../app/layout";
import Home from "../app/page";

// Why the page is rendered rather than read as source, and what rendering does not cover, are
// both on assertClean.
const MARKUP = renderToStaticMarkup(createElement(Home));
const COPY = textNodes(MARKUP);

/*
 * The <title> and <meta description> make the same kind of claim and travel furthest from the
 * site. The layout is not rendered: it is a shell around {children} whose output would be the
 * page again, so the metadata export is read directly. The structural assertions below stay on
 * the page alone — they are about how this page is built.
 */
const META = `${metadata.title} ${metadata.description}`;

describe("seriora.ai copy", () => {
  test("says nothing the copy policy forbids", () => {
    assertClean(`${COPY} ${META}`);
  });

  test("leads with the research thesis", () => {
    expect(COPY).toContain("An independent research lab");
    expect(COPY).toContain("We study agents that improve themselves.");
  });

  /*
   * The hero, the problem, the open problems and the principles have to read the same way if
   * the lab ships a second product, so within <main> the only place a product name may appear
   * is the products list. Both cuts are asserted to have removed something — a selector that
   * quietly stops matching would leave this test passing while checking nothing.
   *
   * The nav and the footer are outside <main> deliberately, not overlooked: SiteNav's "Agent"
   * entry and SiteFooter's `lzvxck/seri-agent` repo label are site chrome that names the
   * product on purpose, and the source-reading version of this test could not see the footer
   * one at all, because it is built from a URL constant the test cut before matching.
   *
   * "Seriora" is the lab itself, not a product, and does not match \bseri\b.
   */
  test("names no product outside the products list", () => {
    const main = MARKUP.match(/<main[\s\S]*<\/main>/);
    expect(main).not.toBeNull();

    const products = main![0].match(/<ul id="products"[\s\S]*?<\/ul>/);
    expect(products).not.toBeNull();

    expect(textNodes(main![0].replace(products![0], ""))).not.toMatch(/\bseri\b/i);
  });

  test("puts the products in a grid that takes a second entry unchanged", () => {
    const grid = MARKUP.match(/<ul id="products"[^>]*>/);
    expect(grid).not.toBeNull();
    expect(grid![0]).toContain("md:grid-cols-2");
  });
});
