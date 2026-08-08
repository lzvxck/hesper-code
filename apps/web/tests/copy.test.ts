import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, test } from "bun:test";

import { assertClean, textNodes } from "@seri/copy-policy";
import Holding from "../app/holding/page";
import { metadata } from "../app/layout";
import Home from "../app/page";
import { PLATFORMS } from "../components/InstallTabs";

// Why the page is rendered rather than read as source, and what rendering does not cover, are
// both on assertClean.
const RENDERED = textNodes(renderToStaticMarkup(createElement(Home)));

/*
 * The install tabs are the one region of this page rendering cannot reach. InstallTabs is a
 * Radix Tabs with defaultValue="macos", and Radix does not render the children of a closed
 * TabsContent — measured on the real render: three role="tabpanel" elements, and 27,921 chars
 * of markup holding neither "install.ps1" nor either of the two non-default notes. So the
 * Windows command and the Linux and Windows notes shipped as user-visible copy no pattern was
 * ever tested against. ("PowerShell" is in that markup, from the Supported platforms prose
 * further down the page — which is why the absent strings, not that word, are the evidence.)
 *
 * Reading the array is the fix rather than rendering with forceMount, which would mount all
 * three panels in every visitor's DOM to suit a test. The array is already a module-level
 * const and the strings in it are the copy; nothing about the shipped page changes.
 */
const TABS = PLATFORMS.map((platform) => `${platform.command} ${platform.note}`).join(" ");

const COPY = `${RENDERED} ${TABS}`;

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

  /*
   * The holding page proxy.ts rewrites `/` to while SERI_COMING_SOON is set. It is held to the
   * same policy as the page it stands in for, including the layout metadata a visitor still
   * gets served underneath it, and it is asserted here rather than in packages/ui because this
   * is where this site's real props for <ComingSoon> are written.
   */
  test("the holding page says nothing the copy policy forbids", () => {
    assertClean(`${textNodes(renderToStaticMarkup(createElement(Holding)))} ${META}`, {
      allowComingSoon: true,
    });
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
