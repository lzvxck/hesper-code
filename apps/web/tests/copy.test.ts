import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, test } from "bun:test";

import { assertClean, textNodes } from "@seri/copy-policy";
import { metadata } from "../app/layout";
import Home from "../app/page";

// Why the page is rendered rather than read as source, and what rendering does not cover, are
// both on assertClean.
const COPY = textNodes(renderToStaticMarkup(createElement(Home)));

/*
 * The <title> and <meta description> make the same claims and travel furthest from the site.
 * The layout is not rendered: it is a shell around {children} whose output would be the page
 * again, so the metadata export is read directly, which is both simpler and exact.
 */
const META = `${metadata.title} ${metadata.description}`;

describe("apps/web copy", () => {
  test("says nothing the copy policy forbids", () => {
    assertClean(`${COPY} ${META}`);
  });

  // D7: the gate and the bound are what make the learning claim checkable, so both are pinned.
  // Pinning only the gate let the bound be deleted with the suite still green.
  //
  // "/memory approve" is a spelling lock on the page, not a check against the binary: apps/cli
  // ships no /memory handler yet, so nothing here can confirm the command exists. What it stops
  // is the page renaming a command the docs spell this way.
  test("leads with the learning claim, and the gate and bound that hedge it", () => {
    expect(COPY).toContain("learns from its own work");
    expect(COPY).toContain("/memory approve");
    expect(COPY).toContain("bounded");
    expect(COPY).toContain("size budget");
  });
});
