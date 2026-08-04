import { CustomerPortal } from "@polar-sh/nextjs";
import type { NextRequest } from "next/server";
import { polarServer } from "@/lib/polar";
import { getSessionUser } from "@/lib/session";

/*
 * Invoices, receipts, payment method and cancellation all live in Polar's own portal and
 * none of it is rebuilt here — self-service cancellation is a legal requirement in some
 * jurisdictions, which is not a thing to reimplement.
 *
 * Exported so a test can prove the thing that matters: the customer comes from the session,
 * and the request is not consulted at all.
 */
export async function getExternalCustomerId(): Promise<string> {
  return (await getSessionUser()).userId;
}

// Built per request rather than once at module load, so returnUrl can be this deployment's
// own origin and the customer has a way back from Polar.
export async function GET(request: NextRequest): Promise<Response> {
  return CustomerPortal({
    accessToken: process.env.POLAR_ACCESS_TOKEN!,
    server: polarServer(),
    returnUrl: new URL("/", request.url).toString(),
    getExternalCustomerId,
  })(request);
}
