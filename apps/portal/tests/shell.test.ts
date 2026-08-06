import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { expect, mock, test } from "bun:test";

import { PLANS, USAGE } from "@/lib/routes";

/*
 * Sign out is a server action, so importing Shell pulls in @workos-inc/authkit-nextjs, which
 * pulls in `server-only` — a module whose whole job is to throw outside a Next server render.
 * The action itself is not what this test is about, so it is replaced and Shell imported after.
 */
mock.module("@/lib/actions", () => ({ endSession: async () => {} }));

const { Shell } = await import("@/app/Shell");

/*
 * Only the in-app destinations: the wordmark anchor and the GitHub links are absolute or
 * in-page and belong to the chrome, not to the control row.
 */
const inAppLinks = (current: "account" | "usage") =>
  renderToStaticMarkup(
    createElement(Shell, { email: "customer@example.com", current, children: null }),
  ).match(/href="\/[^"]*"/g);

/*
 * The bug this pins shipped: /usage rendered a "View usage" button pointing at the page it was
 * already on, and with the wordmark being an in-page anchor, nothing on it reached the plans
 * again — the account page was unreachable from the one link that led away from it.
 */
test("each signed-in page links to the other one, never to itself", () => {
  expect(inAppLinks("account")).toEqual([`href="${USAGE}"`, 'href="/api/portal"']);
  expect(inAppLinks("usage")).toEqual([`href="${PLANS}"`, 'href="/api/portal"']);
});
