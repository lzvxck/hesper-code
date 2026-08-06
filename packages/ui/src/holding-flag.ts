/*
 * `SERI_COMING_SOON` — the one place the holding-page flag is named, and the one place it is
 * read. `SERI_` is the product's own prefix (the CLI already uses `SERI_WORKOS_CLIENT_ID`,
 * `SERI_TEST_DIR`); the repo's other prefixes name a vendor.
 *
 * Deliberately NOT `NEXT_PUBLIC_`: that prefix inlines the value into the bundle at `next build`
 * time, which is exactly the failure this design was chosen to avoid. apps/lab's and apps/web's
 * `/` are statically prerendered, so a build-time read would bake the answer into the HTML and
 * turning the holding on would need a redeploy. This is called from proxy.ts (Next 16
 * middleware) on each request instead, so setting the variable in the Vercel dashboard takes
 * effect without one.
 *
 * The rule is spelled out rather than written `Boolean(process.env.SERI_COMING_SOON)` because
 * Vercel stores every environment variable as a string, and the naive form therefore lets the
 * literal string "false" switch the holding ON. Two affirmatives are accepted because the
 * dashboard field is free text and both are natural to type; everything else is off — unset,
 * "", "0", "false", "no".
 *
 * To hold all three sites, set it on the Vercel project for each: seriora.ai (apps/lab),
 * seri-agent.seriora.ai (apps/web), portal.seriora.ai (apps/portal). Unsetting it releases them
 * with no deploy. At launch the intended end state is not "left unset" — it is reverting the PR
 * that added this module, the three /holding routes and the copy-policy "Coming soon" exemption,
 * so none of them can outlive the holding period.
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
