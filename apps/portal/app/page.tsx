import { INCLUDED_SPEND_RATIO, PAID_PLANS, PLAN_MONTHLY_USD, type PaidPlan, isPaidPlan } from "@seri/plans";
import { Button, SiteFooter, SiteNav } from "@seri/ui";

import { endSession } from "@/lib/actions";
import { getPolarClient } from "@/lib/polar";
import { ensureProvisioned } from "@/lib/provisioning";
import { getSessionUser } from "@/lib/session";
import { getSupabaseClient } from "@/lib/supabase";

const REPO_URL = "https://github.com/lzvxck/seri-agent";

const TIER_NAME: Record<PaidPlan, string> = { pro: "Pro", max: "Max", ultra: "Ultra" };

/*
 * Derived from PAID_PLANS rather than written out again, so the ladder the page renders is
 * the same ordered list isUpgrade decides directions from — the previous copy could be
 * reordered or repriced on its own and nothing would have noticed.
 */
const TIERS = PAID_PLANS.map((plan) => ({
  plan,
  name: TIER_NAME[plan],
  price: PLAN_MONTHLY_USD[plan],
  included: PLAN_MONTHLY_USD[plan] * INCLUDED_SPEND_RATIO,
}));

export default async function AccountPage() {
  const user = await getSessionUser();
  const plan = await ensureProvisioned(
    { supabase: getSupabaseClient(), polar: getPolarClient(), products: process.env },
    user,
  );

  /*
   * Only a positively recognized paid plan can be changed through /api/plan; everything
   * else goes to checkout, because free -> paid cannot be an update (the free subscription
   * never took a card, so Polar answers 402). Sending an unrecognized plan to checkout is
   * safe now that createCheckout refuses an account already holding something paid.
   */
  const action = isPaidPlan(plan) ? "/api/plan" : "/api/checkout";

  return (
    <>
      <SiteNav wordmark="seri" repoUrl={REPO_URL} links={[]} />

      <main id="top">
        <section className="mx-auto max-w-[1080px] px-11 pt-34 pb-29 md:px-16 md:pt-51 md:pb-34">
          <p className="mb-11 font-mono text-ink-subtle uppercase tracking-[1px]">{user.email}</p>
          <h1 className="text-[38px] leading-[1.1] font-bold tracking-[-1px] md:text-display">
            {plan ? `You're on ${plan}.` : "Your plan isn't recognized."}
          </h1>
          <p className="mt-11 max-w-[62ch] text-ink-subtle md:mt-16 md:text-[16px]/[1.4]">
            Bring your own key stays free forever and needs no account at all. These plans exist for the
            hosted option, where seri manages the keys and you pay for the upstream usage you actually make.
          </p>

          <div className="mt-29 grid gap-11 md:mt-34 md:grid-cols-3">
            {TIERS.map((tier) => (
              <div key={tier.plan} className="border border-ink-hairline p-11">
                <h2 className="font-mono text-mono font-bold tracking-[-0.4px]">{tier.name}</h2>
                <p className="mt-8 text-[28px] leading-[1.1] font-bold tracking-[-0.8px]">
                  {`$${tier.price}`}
                  <span className="text-ink-subtle text-body font-normal">/mo</span>
                </p>
                <p className="mt-8 text-ink-subtle">{`$${tier.included}/mo of included usage`}</p>
                <form action={action} method="post" className="mt-11">
                  <input type="hidden" name="plan" value={tier.plan} />
                  <Button type="submit" disabled={plan === tier.plan}>
                    {plan === tier.plan ? "Current plan" : `Switch to ${tier.name}`}
                  </Button>
                </form>
              </div>
            ))}
          </div>

          <div className="mt-29 flex flex-wrap items-center gap-8 md:mt-34">
            <Button asChild variant="outline">
              {/* Invoices, receipts, payment method and cancellation all live in Polar. */}
              <a href="/api/portal">Manage billing</a>
            </Button>
            <form action={endSession}>
              <Button type="submit" variant="ghost">
                Sign out
              </Button>
            </form>
          </div>
        </section>
      </main>

      <SiteFooter
        wordmark="seri"
        repoUrl={REPO_URL}
        builtBy={{ label: "Seriora Research", href: "https://seriora.ai" }}
      />
    </>
  );
}
