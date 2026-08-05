import { INCLUDED_SPEND_RATIO, PLAN_MONTHLY_USD, type Plan, isPaidPlan } from "@seri/plans";
import { Button, SiteFooter, SiteNav } from "@seri/ui";
import type { ReactNode } from "react";

import { planCards } from "@/lib/accountView";
import { endSession } from "@/lib/actions";
import { getPolarClient } from "@/lib/polar";
import { ensureProvisioned } from "@/lib/provisioning";
import { getSessionUser } from "@/lib/session";
import { getSupabaseClient } from "@/lib/supabase";

const REPO_URL = "https://github.com/lzvxck/seri-agent";

const TIER_NAME: Record<Plan, string> = { free: "Free", pro: "Pro", max: "Max", ultra: "Ultra" };

/*
 * Price and included-spend copy for one card. The ladder's *membership and order* are
 * deliberately not here — planCards owns them, derived from PLANS, the same ordered list
 * isUpgrade decides directions from. A second copy could be reordered or repriced on its own
 * and nothing would notice.
 *
 * Free is a tier here, not the absence of one: it carries real zero-cost models and a real
 * $0 Polar subscription, so it gets a card like everything else.
 */
function tierCopy(plan: Plan) {
  const price = isPaidPlan(plan) ? PLAN_MONTHLY_USD[plan] : 0;
  return {
    name: TIER_NAME[plan],
    price,
    detail: isPaidPlan(plan) ? `$${price * INCLUDED_SPEND_RATIO}/mo of included usage` : "Zero-cost models only",
  };
}

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

/*
 * `updated` is set by the 303 every completed plan change answers with, and by the checkout's
 * successUrl. It means "the subscription changed a moment ago", which is exactly when
 * `account_status` cannot be trusted: the webhook writes it asynchronously, so the row still
 * describes the previous state and looks perfectly current while doing so.
 *
 * It is a hint about freshness and nothing else — no account, plan or amount is ever taken
 * from the request. The worst a forged one can do is make the page ask Polar.
 */
export default async function AccountPage({
  searchParams,
}: {
  // `?updated=1&updated=2` arrives as an array; only its presence is ever read, but the
  // annotation should not claim a shape Next does not guarantee.
  searchParams: Promise<{ updated?: string | string[] }>;
}) {
  const user = await getSessionUser();
  const { updated } = await searchParams;
  const { plan, endsAt } = await ensureProvisioned(
    { supabase: getSupabaseClient(), polar: getPolarClient(), products: process.env },
    user,
    { fresh: updated !== undefined },
  );
  const cards = planCards(plan, endsAt, formatDate);

  /*
   * Three states, one layout. What varies above the ladder is the heading, the paragraph and
   * whether Resume is offered; the ladder itself is always rendered, because it is the only
   * thing on the page that says what exists, what it costs, and where this account is
   * standing among it. An earlier version returned early in the two states below and showed
   * a banner instead — which left a customer mid-cancellation with no view of the plans at
   * all and no anchor for where they were.
   *
   * `plan === null` is an active subscription on a product this deployment has no mapping
   * for: an archived one, and a state that recurs by design, since production products are
   * created fresh and subscribers on retired ones stay subscribed. Manage billing is the
   * honest destination and Polar genuinely does handle it.
   */
  const { heading, blurb } =
    plan === null
      ? {
          heading: "You're on a plan we no longer offer.",
          blurb:
            "Your subscription is still active and nothing has changed about it, but it is on a product that has been retired, so it cannot be switched from here. Manage billing has your invoices and can cancel it; after that you'll land back on Free and can pick a current plan.",
        }
      : endsAt
        ? {
            heading: `${TIER_NAME[plan]} until ${formatDate(endsAt)}, then Free.`,
            blurb:
              "Nothing more will be charged. You keep everything you have paid for until then, and you will move to Free automatically — there is nothing to do. Resume if you would rather keep it, or to change plan: switching is refused while a cancellation is pending.",
          }
        : {
            heading: `You're on ${TIER_NAME[plan]}.`,
            blurb:
              "Bring your own key stays free forever and needs no account at all. These plans exist for the hosted option, where seri manages the keys and you pay for the upstream usage you actually make.",
          };

  return (
    <Shell email={user.email}>
      <h1 className="text-[38px] leading-[1.1] font-bold tracking-[-1px] md:text-display">{heading}</h1>
      <p className="mt-11 max-w-[62ch] text-ink-subtle md:mt-16 md:text-[16px]/[1.4]">{blurb}</p>

      {/* Resume is our own route — Polar's customer portal offers no control for it, which is
          why the previous copy telling the customer to look there could not be followed. It
          sits above the ladder because while a cancellation is pending it is the only action
          on this page that leads anywhere. */}
      {endsAt && plan !== null && (
        <form action="/api/resume" method="post" className="mt-29 md:mt-34">
          <Button type="submit">{`Resume ${TIER_NAME[plan]}`}</Button>
        </form>
      )}

      {/*
       * One form for all four cards, and no client JavaScript: selection is a radio, the
       * card styling is `peer-checked`, and the submit inside a card only exists once that
       * card is the checked one. The page stays a server component whose only action is a
       * plain POST answered with a 303 — which is why the security invariant is as small as
       * it is, and worth more than a nicer transition would be.
       *
       * In the two states where planCards makes nothing selectable the form holds no radio
       * and no submit at all: the cards are still there to be read, and the form is inert.
       */}
      <form action="/api/plan" method="post" className="mt-29 grid gap-11 md:mt-34 md:grid-cols-4">
        {cards.map((card) => {
          const tier = tierCopy(card.plan);
          return (
            <div
              key={card.plan}
              className={[
                "relative border p-11 transition-[background-color,border-color] duration-200 ease-brand motion-reduce:transition-none",
                // Current and selected have to be told apart, not just told apart from the
                // default: current is fully inverted, selected is a tint with a solid edge.
                card.current
                  ? "border-ink bg-ink text-on-ink"
                  : "border-ink-hairline has-[:checked]:border-ink has-[:checked]:bg-ink/6",
              ].join(" ")}
            >
              {card.selectable && (
                <>
                  <input
                    id={`plan-${card.plan}`}
                    type="radio"
                    name="plan"
                    value={card.plan}
                    className="peer sr-only"
                  />
                  {/* Covers the card so the whole thing is the click target. The submit sits
                      above it, so pressing the button does not re-toggle the radio. */}
                  <label htmlFor={`plan-${card.plan}`} className="absolute inset-0 cursor-pointer">
                    <span className="sr-only">{`Select ${tier.name}`}</span>
                  </label>
                </>
              )}

              <h2 className="font-mono text-mono font-bold tracking-[-0.4px]">{tier.name}</h2>
              <p className="mt-8 text-[28px] leading-[1.1] font-bold tracking-[-0.8px]">
                {`$${tier.price}`}
                <span
                  className={`text-body font-normal ${card.current ? "text-on-ink-subtle" : "text-ink-subtle"}`}
                >
                  /mo
                </span>
              </p>
              <p className={`mt-8 ${card.current ? "text-on-ink-subtle" : "text-ink-subtle"}`}>
                {tier.detail}
              </p>

              {card.note ? (
                <p
                  className={`mt-11 font-mono uppercase tracking-[1px] ${card.current ? "text-on-ink-subtle" : "text-ink-subtle"}`}
                >
                  {card.note}
                </p>
              ) : card.selectable ? (
                <div className="relative mt-11 hidden peer-checked:block">
                  <Button type="submit">{`Switch to ${tier.name}`}</Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </form>
    </Shell>
  );
}
