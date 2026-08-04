import { createCheckout } from "@/lib/billing";
import { getPolarClient } from "@/lib/polar";
import { getSessionUser } from "@/lib/session";

// The body carries a plan label and nothing else; the account is the session's.
export async function POST(request: Request): Promise<Response> {
  const { userId } = await getSessionUser();
  const form = await request.formData();
  return createCheckout({ polar: getPolarClient(), products: process.env, userId }, form.get("plan"));
}
