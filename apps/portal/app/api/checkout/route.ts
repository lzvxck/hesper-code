import { createCheckout } from "@/lib/billing";
import { getPolarClient } from "@/lib/polar";
import { getSessionUser } from "@/lib/session";

// The body carries a plan label and nothing else; the account is the session's. The origin
// is this deployment's own, so Polar can send the customer back here after paying.
export async function POST(request: Request): Promise<Response> {
  const { userId } = await getSessionUser();
  const form = await request.formData();
  return createCheckout(
    { polar: getPolarClient(), products: process.env, userId, origin: new URL(request.url).origin },
    form.get("plan"),
  );
}
