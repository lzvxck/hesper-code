import type { Order } from "@polar-sh/sdk/models/components/order";
import { INCLUDED_SPEND_RATIO, PLAN_MONTHLY_USD, type Plan, isPaidPlan } from "@seri/plans";
import type { ScheduledChange } from "./scheduled";

const TIER_NAME: Record<Plan, string> = { free: "Free", pro: "Pro", max: "Max", ultra: "Ultra" };

export type SubscriptionSummary = { title: string; state: string; allowanceLine: string };

/*
 * Covers exactly the four states `app/page.tsx:70-92` already distinguishes, and no others: an
 * unrecognized product, a pending cancellation, a pending downgrade, and a plain renewing
 * subscription. `renewsAt` only matters in the last of those — once anything is scheduled, its
 * own date (carried on `scheduled`) is what the page shows instead.
 */
export function subscriptionSummary(
  plan: Plan | null,
  renewsAt: Date | null,
  scheduled: ScheduledChange | null,
  formatDate: (date: Date) => string,
): SubscriptionSummary {
  if (plan === null) {
    return {
      title: "Plan not recognized",
      state: "You're on a plan we no longer offer. Invoices and payment method are below.",
      allowanceLine: "",
    };
  }

  const title = TIER_NAME[plan];
  const allowanceLine = allowanceSentence(plan);

  if (scheduled?.kind === "ends") {
    return { title, state: `Ends ${formatDate(scheduled.at)}`, allowanceLine };
  }
  if (scheduled) {
    const state = `${title} until ${formatDate(scheduled.at)}, then ${TIER_NAME[scheduled.plan]}`;
    return { title, state, allowanceLine };
  }
  return { title, state: renewsAt ? `Renews ${formatDate(renewsAt)}` : "", allowanceLine };
}

/*
 * Free has no dollar allowance at all — it holds zero-cost models only — so this is the one
 * branch that must never show a figure. Every paid plan's allowance is INCLUDED_SPEND_RATIO of
 * its own list price, computed rather than typed out, so a ratio change shows up here without
 * being re-typed by hand.
 */
export function allowanceSentence(plan: Plan): string {
  if (!isPaidPlan(plan)) return "Zero-cost models only.";
  const amount = PLAN_MONTHLY_USD[plan] * INCLUDED_SPEND_RATIO;
  return `Includes $${amount.toFixed(2)} of usage each period.`;
}

export type InvoiceRow = { id: string; date: string; amount: string; status: string };

// Newest first, because that's the order a customer looks for last month's invoice in.
// `status` carries Polar's own vocabulary (paid / refunded / partially_refunded / pending /
// void) rather than a boolean, so a partially refunded order isn't squeezed into a shape that
// only has room for "paid" or "refunded".
export function invoiceRows(orders: Order[], formatDate: (date: Date) => string): InvoiceRow[] {
  return [...orders]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((order) => ({
      id: order.id,
      date: formatDate(order.createdAt),
      amount: `$${(order.totalAmount / 100).toFixed(2)}`,
      status: order.status,
    }));
}
