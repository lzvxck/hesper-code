import { CustomerPortal } from "@polar-sh/nextjs";
import type { NextRequest } from "next/server";
import { portalOrigin } from "@/lib/origin";
import { polarServer } from "@/lib/polar";
import { ACCOUNT_UPDATED } from "@/lib/routes";
import { getSessionUser } from "@/lib/session";

/*
 * Invoices, receipts, payment method and cancellation all live in Polar's own portal and
 * none of it is rebuilt here — self-service cancellation is a legal requirement in some
 * jurisdictions, which is not a thing to reimplement.
 *
 * The customer comes from the session and the return URL from configuration; the request is
 * only forwarded, never read.
 *
 * The return carries the same freshness marker a plan change does, and unlike a plan change it
 * is a guess: cancelling happens *there*, but so does reading an invoice, and the two returns
 * are indistinguishable from here. The guess is deliberately the expensive one — a Polar
 * round-trip on a read-only visit costs a page load, while missing a cancellation that did
 * happen shows the customer a subscription they have already ended. Why the row cannot be
 * trusted right afterwards is in provisioning.ts, above the fast path.
 */
export async function GET(request: NextRequest): Promise<Response> {
  return CustomerPortal({
    accessToken: process.env.POLAR_ACCESS_TOKEN!,
    server: polarServer(),
    returnUrl: `${portalOrigin()}${ACCOUNT_UPDATED}`,
    getExternalCustomerId: async () => (await getSessionUser()).userId,
  })(request);
}
