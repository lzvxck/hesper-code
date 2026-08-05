import { CustomerPortal } from "@polar-sh/nextjs";
import type { NextRequest } from "next/server";
import { UPDATED } from "@/lib/billing";
import { portalOrigin } from "@/lib/origin";
import { polarServer } from "@/lib/polar";
import { getSessionUser } from "@/lib/session";

/*
 * Invoices, receipts, payment method and cancellation all live in Polar's own portal and
 * none of it is rebuilt here — self-service cancellation is a legal requirement in some
 * jurisdictions, which is not a thing to reimplement.
 *
 * The customer comes from the session and the return URL from configuration; the request is
 * only forwarded, never read.
 *
 * The return carries the same freshness marker a plan change does, and for the same reason:
 * cancelling happens *there*, so a customer coming back has just changed their subscription
 * and `account_status` is the one thing on this side that does not know yet.
 */
export async function GET(request: NextRequest): Promise<Response> {
  return CustomerPortal({
    accessToken: process.env.POLAR_ACCESS_TOKEN!,
    server: polarServer(),
    returnUrl: `${portalOrigin()}${UPDATED}`,
    getExternalCustomerId: async () => (await getSessionUser()).userId,
  })(request);
}
