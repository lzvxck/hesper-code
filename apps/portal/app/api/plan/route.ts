import { selectPlan } from "@/lib/billing";
import { portalOrigin } from "@/lib/origin";
import { getPolarClient } from "@/lib/polar";
import { getSessionUser } from "@/lib/session";

// The body carries a plan label and nothing else; the account is the session's. Whether
// that label means an update or a checkout is decided server-side, not by the page.
export async function POST(request: Request): Promise<Response> {
  const { userId } = await getSessionUser();
  const form = await request.formData();
  return selectPlan(
    { polar: getPolarClient(), products: process.env, userId, origin: portalOrigin() },
    form.get("plan"),
  );
}
