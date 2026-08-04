import { changePlan } from "@/lib/billing";
import { portalOrigin } from "@/lib/origin";
import { getPolarClient } from "@/lib/polar";
import { getSessionUser } from "@/lib/session";

// Paid <-> paid only. The body carries a plan label and nothing else; the account is the
// session's.
export async function POST(request: Request): Promise<Response> {
  const { userId } = await getSessionUser();
  const form = await request.formData();
  return changePlan(
    { polar: getPolarClient(), products: process.env, userId, origin: portalOrigin() },
    form.get("plan"),
  );
}
