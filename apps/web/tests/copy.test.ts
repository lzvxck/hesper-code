import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, test } from "bun:test";

import { FUTURITY, OVERCLAIMS, UNSHIPPED, found, textNodes } from "@seri/copy-policy";
import { metadata } from "../app/layout";
import Home from "../app/page";

/*
 * The page is rendered, not read as source. Reading page.tsx as text scanned its code comments
 * as if they were copy, in both directions: a comment holding the pinned phrases kept this suite
 * green while the gate card was deleted from the JSX outright, and a comment that merely
 * mentioned an OS sandbox turned it red while nothing on the page said so.
 *
 * Rendering is cheap because this is a server component with no data of its own, and it asserts
 * what actually ships. renderToStaticMarkup produces the initial state and runs no effects,
 * which is what we want — Reveal's animation is not copy.
 */
const COPY = textNodes(renderToStaticMarkup(createElement(Home)));

/*
 * The <title> and <meta description> make the same claims and travel furthest from the site.
 * The layout is not rendered: it is a shell around {children} whose output would be the page
 * again, so the metadata export is read directly, which is both simpler and exact.
 */
const META = `${metadata.title} ${metadata.description}`;

describe("apps/web copy", () => {
  test("makes no claim a reader cannot check", () => {
    expect(found(`${COPY} ${META}`, OVERCLAIMS)).toEqual([]);
  });

  test("promises nothing for later", () => {
    expect(found(`${COPY} ${META}`, FUTURITY)).toEqual([]);
  });

  test("claims nothing this release does not ship", () => {
    expect(found(`${COPY} ${META}`, UNSHIPPED)).toEqual([]);
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
