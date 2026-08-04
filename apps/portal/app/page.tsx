import { INCLUDED_SPEND_RATIO, PLANS, PLAN_MONTHLY_USD, type Plan, isPaidPlan } from "@seri/plans";
import { Button, SiteFooter, SiteNav } from "@seri/ui";
import type { ReactNode } from "react";

import { endSession } from "@/lib/actions";
import { getPolarClient } from "@/lib/polar";
import { ensureProvisioned } from "@/lib/provisioning";
import { getSessionUser } from "@/lib/session";
import { getSupabaseClient } from "@/lib/supabase";

const REPO_URL = "https://github.com/lzvxck/seri-agent";

const TIER_NAME: Record<Plan, string> = { free: "Free", pro: "Pro", max: "Max", ultra: "Ultra" };

/*
 * Derived from PLANS rather than written out again, so the ladder the page renders is the
 * same ordered list isUpgrade decides directions from — a second copy could be reordered or
 * repriced on its own and nothing would notice.
 *
 * Free is a tier here, not the absence of one: it carries real zero-cost models and a real
 * $0 Polar subscription, so it gets a card like everything else.
 */
const TIERS = PLANS.map((plan) => ({
  plan,
  name: TIER_NAME[plan],
  price: isPaidPlan(plan) ? PLAN_MONTHLY_USD[plan] : 0,
  detail: isPaidPlan(plan)
    ? `$${PLAN_MONTHLY_USD[plan] * INCLUDED_SPEND_RATIO}/mo of included usage`
    : "Zero-cost models only",
}));

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

function Shell({ email, children }: { email: string; children: ReactNode }) {
  return (
    <>
      <SiteNav wordmark="seri" repoUrl={REPO_URL} links={[]} />

      <main id="top">
        <section className="mx-auto max-w-[1080px] px-11 pt-34 pb-29 md:px-16 md:pt-51 md:pb-34">
          <p className="mb-11 font-mono text-ink-subtle uppercase tracking-[1px]">{email}</p>
          {children}

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

export default async function AccountPage() {
  const user = await getSessionUser();
  const { plan, endsAt } = await ensureProvisioned(
    { supabase: getSupabaseClient(), polar: getPolarClient(), products: process.env },
    user,
  );

  /*
   * An active subscription on a product this deployment has no mapping for — an archived
   * one, and a state that recurs by design, since production products are created fresh and
   * subscribers on retired ones stay subscribed.
   *
   * No tier buttons: every one of them would 409, because createCheckout refuses an account
   * already holding something paid and /api/plan cannot identify what to change. Manage
   * billing is the honest destination, and Polar genuinely does handle it.
   */
  if (plan === null) {
    return (
      <Shell email={user.email}>
        <h1 className="text-[38px] leading-[1.1] font-bold tracking-[-1px] md:text-display">
          You're on a plan we no longer offer.
        </h1>
        <p className="mt-11 max-w-[62ch] text-ink-subtle md:mt-16 md:text-[16px]/[1.4]">
          Your subscription is still active and nothing has changed about it, but it is on a product
          that has been retired, so it cannot be switched from here. Manage billing has your invoices
          and can cancel it; after that you'll land back on Free and can pick a current plan.
        </p>
      </Shell>
    );
  }

  /*
   * Scheduled to cancel. The ladder is deliberately absent: a plan change 409s until the
   * cancellation is cleared, so the only honest action is to clear it. Resume is our own
   * route — Polar's customer portal offers no control for it, which is why the previous copy
   * telling the customer to look there could not be followed.
   */
  if (endsAt) {
    return (
      <Shell email={user.email}>
        <h1 className="text-[38px] leading-[1.1] font-bold tracking-[-1px] md:text-display">
          {`${TIER_NAME[plan]} until ${formatDate(endsAt)}, then Free.`}
        </h1>
        <p className="mt-11 max-w-[62ch] text-ink-subtle md:mt-16 md:text-[16px]/[1.4]">
          Nothing more will be charged. You keep everything you have paid for until then, and you will
          move to Free automatically — there is nothing to do. Resume if you would rather keep it.
        </p>
        <form action="/api/resume" method="post" className="mt-29 md:mt-34">
          <Button type="submit">{`Resume ${TIER_NAME[plan]}`}</Button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell email={user.email}>
      <h1 className="text-[38px] leading-[1.1] font-bold tracking-[-1px] md:text-display">
        {`You're on ${TIER_NAME[plan]}.`}
      </h1>
      <p className="mt-11 max-w-[62ch] text-ink-subtle md:mt-16 md:text-[16px]/[1.4]">
        Bring your own key stays free forever and needs no account at all. These plans exist for the
        hosted option, where seri manages the keys and you pay for the upstream usage you actually make.
      </p>

      {/*
       * One form for all four cards, and no client JavaScript: selection is a radio, the
       * card styling is `peer-checked`, and the submit inside a card only exists once that
       * card is the checked one. The page stays a server component whose only action is a
       * plain POST answered with a 303 — which is why the security invariant is as small as
       * it is, and worth more than a nicer transition would be.
       */}
      <form action="/api/plan" method="post" className="mt-29 grid gap-11 md:mt-34 md:grid-cols-4">
        {TIERS.map((tier) => {
          const current = tier.plan === plan;
          return (
            <div
              key={tier.plan}
              className={[
                "relative border p-11 transition-[background-color,border-color] duration-200 ease-brand motion-reduce:transition-none",
                // Current and selected have to be told apart, not just told apart from the
                // default: current is fully inverted, selected is a tint with a solid edge.
                current
                  ? "border-ink bg-ink text-on-ink"
                  : "border-ink-hairline has-[:checked]:border-ink has-[:checked]:bg-ink/6",
              ].join(" ")}
            >
              {!current && (
                <>
                  <input
                    id={`plan-${tier.plan}`}
                    type="radio"
                    name="plan"
                    value={tier.plan}
                    className="peer sr-only"
                  />
                  {/* Covers the card so the whole thing is the click target. The submit sits
                      above it, so pressing the button does not re-toggle the radio. */}
                  <label htmlFor={`plan-${tier.plan}`} className="absolute inset-0 cursor-pointer">
                    <span className="sr-only">{`Select ${tier.name}`}</span>
                  </label>
                </>
              )}

              <h2 className="font-mono text-mono font-bold tracking-[-0.4px]">{tier.name}</h2>
              <p className="mt-8 text-[28px] leading-[1.1] font-bold tracking-[-0.8px]">
                {`$${tier.price}`}
                <span
                  className={`text-body font-normal ${current ? "text-on-ink-subtle" : "text-ink-subtle"}`}
                >
                  /mo
                </span>
              </p>
              <p className={`mt-8 ${current ? "text-on-ink-subtle" : "text-ink-subtle"}`}>{tier.detail}</p>

              {current ? (
                <p className="mt-11 font-mono text-on-ink-subtle uppercase tracking-[1px]">Current plan</p>
              ) : (
                <div className="relative mt-11 hidden peer-checked:block">
                  <Button type="submit">{`Switch to ${tier.name}`}</Button>
                </div>
              )}
            </div>
          );
        })}
      </form>
    </Shell>
  );
}
