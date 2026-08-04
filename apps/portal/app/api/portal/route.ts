import { CustomerPortal } from "@polar-sh/nextjs";
import { polarServer } from "@/lib/polar";
import { getSessionUser } from "@/lib/session";

/*
 * Invoices, receipts, payment method and cancellation all live in Polar's own portal and
 * none of it is rebuilt here — self-service cancellation is a legal requirement in some
 * jurisdictions, which is not a thing to reimplement.
 *
 * The customer is resolved from the session, never from the request.
 */
export const GET = CustomerPortal({
  accessToken: process.env.POLAR_ACCESS_TOKEN!,
  server: polarServer(),
  getExternalCustomerId: async () => (await getSessionUser()).userId,
});
