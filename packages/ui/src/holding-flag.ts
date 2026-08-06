/*
 * `SERI_COMING_SOON` — the one place the holding-page flag is named, and the one place it is
 * read. `SERI_` is the product's own prefix (the CLI already uses `SERI_WORKOS_CLIENT_ID`,
 * `SERI_TEST_DIR`); the repo's other prefixes name a vendor.
 *
 * Deliberately NOT `NEXT_PUBLIC_`, and read from middleware rather than from a page. Both
 * amount to the same property: the value never reaches a build artefact. `NEXT_PUBLIC_` inlines
 * it into the bundle at `next build` time, and apps/lab's and apps/web's `/` are statically
 * prerendered, so a page-level read would bake the answer into the prerendered HTML.
 *
 * What that buys is NOT deployment ergonomics — see the paragraph below — it is that **no page
 * component reads the environment at all**. That is what keeps apps/lab's and apps/web's copy
 * suites untouched and independent of the environment they run in, and what avoids making a
 * page async, which `renderToStaticMarkup` throws on. proxy.ts (Next 16 middleware) calls this
 * on each request within a deployment, which the loop's build-unset/start-set check proves:
 * the same build artefact serves the real page with the variable unset and the holding page
 * with it set.
 *
 * It does NOT make the flag a live switch. Vercel deployments are immutable and environment
 * variables are bound to the deployment that was built with them, so changing the value in the
 * dashboard does not reach a running deployment — **turning the holding on or off requires a
 * redeploy**, wherever in the app the value is read.
 *
 * The rule is spelled out rather than written `Boolean(process.env.SERI_COMING_SOON)` because
 * Vercel stores every environment variable as a string, and the naive form therefore lets the
 * literal string "false" switch the holding ON. Two affirmatives are accepted because the
 * dashboard field is free text and both are natural to type; everything else is off — unset,
 * "", "0", "false", "no".
 *
 * To hold all three sites, set it on the Vercel project for each — seriora.ai (apps/lab),
 * seri-agent.seriora.ai (apps/web), portal.seriora.ai (apps/portal) — and redeploy each. Same
 * to release them: unset it and redeploy. At launch the intended end state is not "left unset"
 * — it is reverting the PR that added this module, the three /holding routes and the
 * copy-policy "Coming soon" exemption, so none of them can outlive the holding period.
 *
 * Exported through the "./holding-flag" subpath rather than the package barrel: the barrel
 * re-exports React components including a "use client" module, and the caller here is Edge
 * middleware. A subpath keeps React out of that bundle by construction rather than by trusting
 * tree-shaking through a barrel.
 */
/*
 * The one global this package reads, declared at the width it is used. packages/ui is typed
 * `types: ["react"]` with `lib: ["dom", ...]`, so `process` is unknown here; adding @types/node
 * to fix one env read would put Node's globals in scope for every component in the package and
 * change how existing files type `setTimeout`/`fetch`, which is a wider edit than this needs.
 */
declare const process: { env: Record<string, string | undefined> };

export function isHoldingEnabled(): boolean {
  const value = process.env.SERI_COMING_SOON?.trim().toLowerCase();
  return value === "1" || value === "true";
}
