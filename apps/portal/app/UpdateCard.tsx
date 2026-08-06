"use client";

import { PolarEmbedPaymentMethod } from "@polar-sh/checkout/payment-method";
import { useEffect, useRef } from "react";

/*
 * The only new client component. Mounts Polar's chrome-less payment-method iframe into a
 * region we own, but everything inside it is Polar's: its docs say the embed "operates
 * independently of your site's styling", so this carries its own border and heading rather
 * than trying to disguise it as native — a form that almost matches is worse than one that is
 * visibly a separate surface. It also carries no card markup of its own: the moment a PAN
 * input exists in a DOM we control, we leave PCI SAQ A.
 *
 * `sessionToken` is a live customer credential, minted fresh per render by the server
 * component that renders this — never logged, never cached beyond this one page load.
 *
 * This embed cannot be exercised against the Polar sandbox at `@polar-sh/checkout@0.4.0`, and no
 * published version allows it — all 24 were checked, and `main` is still 0.4.0. The allowed host
 * list is a *build-time constant*: Polar's own `tsup.config.ts` inlines
 * `__POLAR_CHECKOUT_EMBED_SCRIPT_ALLOWED_ORIGINS__` at their publish time, so the shipped bundle
 * carries the literal `"https://polar.sh,https://sandbox.polar.sh"` with no `process.env` read
 * surviving into it, and `payment-method.ts` resolves
 * `origins.includes(window.location.origin) ? window.location.origin : origins[0]` — always
 * production from any other origin. From localhost the iframe therefore loads polar.sh, is handed
 * a sandbox `polar_mst_…` token, posts `{event:"error", code:"unauthorized"}` and then `loaded`,
 * and sits at height 0: a visibly empty box that looks like our bug and is not one. It works in
 * production, where the host, the token and the portal agree. Do not re-derive this from the
 * empty box — see docs-tmp/polar-e2e.md for the pre-launch item that verifies it there.
 */
export function UpdateCard({ sessionToken }: { sessionToken: string }) {
  const element = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!element.current) return;
    const embed = PolarEmbedPaymentMethod.createInline({ sessionToken, element: element.current });
    return () => embed.close();
  }, [sessionToken]);

  return (
    <div className="rounded-md border border-ink-hairline p-11">
      <h3 className="font-mono text-mono font-bold tracking-[-0.4px]">Update card</h3>
      <div ref={element} className="mt-11" />
    </div>
  );
}
