import type { Polar } from "@polar-sh/sdk";
import { isPaidPlan, type Plan } from "@seri/plans";
import { Button } from "@seri/ui";

import { Shell } from "@/app/Shell";
import { UpdateCard } from "@/app/UpdateCard";
import { readAccountStatus } from "@/lib/accountStatus";
import { invoiceRows, subscriptionSummary } from "@/lib/billingView";
import { createCustomerSession } from "@/lib/customerSession";
import { listOrders } from "@/lib/orders";
import { getPaymentMethod, type PaymentMethod } from "@/lib/paymentMethod";
import { getCustomerState, getPolarClient } from "@/lib/polar";
import { ensureProvisioned } from "@/lib/provisioning";
import { getSessionUser } from "@/lib/session";
import { getSupabaseClient } from "@/lib/supabase";
import { type ActiveSubscription, paidSubscription } from "@/lib/subscriptions";

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

function formatCard(method: PaymentMethod): string {
  const month = String(method.expMonth).padStart(2, "0");
  const year = String(method.expYear).slice(-2);
  return `${method.brand.toUpperCase()} ···· ${method.last4} · expires ${month}/${year}`;
}

type Attempt<T> = { ok: true; value: T } | { ok: false };

/*
 * The Polar org access token now carries `orders:read` and `customer_sessions:write` — both
 * exercised against sandbox on 2026-08-06 — but a 429 against the org-wide limit shared with
 * checkout and webhooks is always possible, and any one of these calls can fail on its own.
 * Such a failure must degrade the one section that depends on it to a line of text — never
 * the whole page — so each call is wrapped here rather than left to throw into the nearest
 * error boundary.
 *
 * `ok: false` is deliberately distinct from a value of `null`: `getPaymentMethod` resolving to
 * `null` means Polar was asked and answered "no default method", which is a real empty state.
 * Collapsing the two would show "unavailable" copy for a card that simply is not on file, or
 * "none on file" copy while the account's actual card is unknown.
 */
async function attempt<T>(section: string, fn: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    console.error(`/billing: ${section} degraded —`, error instanceof Error ? error.message : error);
    return { ok: false };
  }
}

const NO_LIVE_SUBSCRIPTION: Attempt<ActiveSubscription | null> = { ok: true, value: null };

/*
 * `ensureProvisioned`'s cached fast path — an active, mapped `account_status` row, the ordinary
 * steady-state load — never asks Polar at all, and deliberately returns `renewsAt: null` and
 * `amount: null` there. That is also this page's most common case, so it asks separately for
 * exactly that display data, composing the same two helpers `ensureProvisioned` itself uses
 * (`getCustomerState`, `paidSubscription`) rather than forcing a cache-skipping option through
 * it — `fresh` there means "this load follows a change the customer just made" and has to stay
 * that way, or the repair path below it stops being reachable from every ordinary load.
 *
 * Matching against the already-known `plan` is deliberate: this may only extend what
 * `ensureProvisioned` returned, never contradict it. A race that changed the plan between the
 * two calls must not show one plan's title next to another plan's renewal date and price.
 */
async function liveSubscription(
  polar: Polar,
  userId: string,
  plan: Plan | null,
): Promise<ActiveSubscription | null> {
  const state = await getCustomerState(polar, userId);
  const paid = paidSubscription(state?.activeSubscriptions ?? [], process.env);
  return paid?.plan === plan ? paid.subscription : null;
}

export default async function BillingPage() {
  const user = await getSessionUser();
  const supabase = getSupabaseClient();
  const polar = getPolarClient();

  const [{ plan, scheduled, renewsAt, amount }, accountStatus] = await Promise.all([
    ensureProvisioned({ supabase, polar, products: process.env }, user),
    readAccountStatus(supabase, user.userId),
  ]);

  // Only the cached fast path leaves renewsAt null on a recognized paid plan — every other
  // path already asked Polar and has both fields.
  const needsLive = renewsAt === null && isPaidPlan(plan);

  const [paymentMethod, orders, session, live] = await Promise.all([
    attempt("payment method", () => getPaymentMethod(user.userId)),
    attempt("invoice history", () => listOrders(polar, user.userId)),
    attempt("payment-method update session", () => createCustomerSession(polar, user.userId)),
    needsLive ? attempt("renewal date", () => liveSubscription(polar, user.userId, plan)) : NO_LIVE_SUBSCRIPTION,
  ]);

  const effectiveRenewsAt = renewsAt ?? (live.ok ? (live.value?.currentPeriodEnd ?? null) : null);
  const effectiveAmount = amount ?? (live.ok ? (live.value?.amount ?? null) : null);

  const summary = subscriptionSummary(plan, effectiveRenewsAt, effectiveAmount, scheduled, formatDate);

  return (
    <Shell email={user.email} current="billing">
      {/*
       * Polar retries a failed payment at +2/+5/+7/+7 days before revoking, and its docs say
       * a customer who has fallen behind "will still need the hosted [portal] to recover from
       * failed payments" — retrying or replacing a card mid-recovery is Polar's flow, not
       * ours. This is the only place /api/portal is linked from now on.
       */}
      {accountStatus?.status === "past_due" && (
        <div data-surface="ink" className="mb-29 border border-ink bg-ink p-11 text-on-ink md:mb-34">
          <h2 className="font-mono text-mono font-bold tracking-[-0.4px]">Payment past due</h2>
          <p className="mt-8 max-w-[62ch] text-on-ink-subtle">
            Polar has been unable to charge your card. Update your payment details in Polar's hosted
            portal to keep your subscription from being canceled.
          </p>
          <Button asChild variant="onInk" size="sm" className="mt-11">
            <a href="/api/portal">Manage billing</a>
          </Button>
        </div>
      )}

      <h1 className="text-[38px] leading-[1.1] font-bold tracking-[-1px] md:text-display">Billing</h1>

      <section className="mt-29 md:mt-34">
        <h2 className="font-mono text-mono font-bold tracking-[-0.4px]">{summary.title}</h2>
        {summary.price && <p className="mt-8 text-ink-subtle">{summary.price}</p>}
        {summary.state && <p className="mt-8 text-ink-subtle">{summary.state}</p>}
        {/* No progress bar: nothing is measured yet, so this is a sentence, not a ratio. */}
        {summary.allowanceLine && <p className="mt-8 text-ink-subtle">{summary.allowanceLine}</p>}
        {/*
         * The remedy for "Plan not recognized" as much as for an ordinary paid plan: ending a
         * subscription never needs to know which plan it was, so this works even where the
         * ladder on `/` cannot. Hidden once a cancellation is already scheduled — Resume there
         * is what calls it off — and for Free, which has nothing to cancel.
         */}
        {plan !== "free" && scheduled?.kind !== "ends" && (
          <form action="/api/cancel" method="post" className="mt-11">
            <Button type="submit" variant="outline" size="sm">
              Cancel subscription
            </Button>
          </form>
        )}
      </section>

      <section className="mt-29 md:mt-34">
        <h2 className="font-mono text-mono font-bold tracking-[-0.4px]">Payment method</h2>
        {!paymentMethod.ok ? (
          <p className="mt-8 text-ink-subtle">Payment method unavailable right now.</p>
        ) : paymentMethod.value ? (
          <p className="mt-8">{formatCard(paymentMethod.value)}</p>
        ) : (
          <p className="mt-8 text-ink-subtle">No payment method on file.</p>
        )}
        {session.ok ? (
          <div className="mt-11">
            <UpdateCard sessionToken={session.value.token} />
          </div>
        ) : (
          <p className="mt-8 text-ink-subtle">Card update unavailable right now.</p>
        )}
      </section>

      <section className="mt-29 md:mt-34">
        <h2 className="font-mono text-mono font-bold tracking-[-0.4px]">Invoices</h2>
        {!orders.ok ? (
          <p className="mt-8 text-ink-subtle">Invoice history unavailable right now.</p>
        ) : orders.value.length === 0 ? (
          <p className="mt-8 text-ink-subtle">No invoices yet.</p>
        ) : (
          <table className="mt-11 w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-ink-hairline">
                <th className="py-4 pr-8 font-normal text-ink-subtle">Date</th>
                <th className="py-4 pr-8 font-normal text-ink-subtle">Amount</th>
                <th className="py-4 pr-8 font-normal text-ink-subtle">Status</th>
                <th className="py-4 font-normal text-ink-subtle" />
              </tr>
            </thead>
            <tbody>
              {invoiceRows(orders.value, formatDate).map((row) => (
                <tr key={row.id} className="border-b border-ink-hairline">
                  <td className="py-6 pr-8">{row.date}</td>
                  <td className="py-6 pr-8">{row.amount}</td>
                  <td className="py-6 pr-8">{row.status}</td>
                  <td className="py-6">
                    {row.status === "paid" && (
                      <a className="underline" href={`/api/invoice?orderId=${encodeURIComponent(row.id)}`}>
                        Download
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </Shell>
  );
}
