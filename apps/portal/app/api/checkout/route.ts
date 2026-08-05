import { createCheckout } from "@/lib/billing";
import { portalOrigin } from "@/lib/origin";
import { getPolarClient } from "@/lib/polar";
import { getSessionUser } from "@/lib/session";

// The body carries a plan label and nothing else. The account comes from the session and
// the return origin from configuration — neither is read off the request.
export async function POST(request: Request): Promise<Response> {
  const { userId } = await getSessionUser();
  const form = await request.formData();
  return createCheckout(
    { polar: getPolarClient(), products: process.env, userId, origin: portalOrigin() },
    form.get("plan"),
  );
}
