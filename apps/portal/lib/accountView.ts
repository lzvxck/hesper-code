import { PLANS, type Plan } from "@seri/plans";

export type PlanCard = {
  plan: Plan;
  /** Filled, inverted styling — the plan the account holds right now. */
  current: boolean;
  /** Replaces the switch button when set. */
  note: string | null;
  /** Carries a radio and, once selected, a Switch button. */
  selectable: boolean;
};

/*
 * The ladder every state renders. It is a function rather than markup because the bug it
 * exists to prevent is a composition bug: the scheduled-cancel state used to *replace* the
 * cards with a banner, so a customer mid-cancellation could not see the plans at all and had
 * no anchor for where they were standing. The cards are now always present and this is where
 * that is decided, somewhere a test can reach without rendering anything.
 *
 * `current` is the plan held *now*. During a scheduled cancellation that is still the paid
 * plan, not Free: Free is where they arrive later, which the note on the Free card says
 * outright. Marking Free as current there is exactly the misreading the old layout invited.
 *
 * Visible is not the same as actionable, and the two states that suppress every button do it
 * for different reasons:
 *
 *   - Scheduled cancellation. `billing.ts` refuses both mechanisms while one is pending —
 *     changePlan answers 409 SCHEDULED_TO_CANCEL on `cancelAtPeriodEnd`, and createCheckout
 *     answers 409 SCHEDULED_TO_CANCEL_CHECKOUT rather than open a second subscription. So the
 *     cards are shown and none of them is selectable; Resume, above the ladder, is the one
 *     action that leads anywhere. Offering a Switch here would render a button whose only
 *     possible answer is an error page.
 *   - An unrecognized plan. The retired-product case: createCheckout refuses an account
 *     already holding something paid, and changePlan cannot identify what to change.
 *
 * `formatDate` is injected so this stays pure and locale-independent under test.
 */
export function planCards(
  plan: Plan | null,
  endsAt: Date | null,
  formatDate: (date: Date) => string,
): PlanCard[] {
  return PLANS.map((tier) => {
    const current = tier === plan;
    const note = current
      ? "Current plan"
      : endsAt && tier === "free"
        ? `Begins ${formatDate(endsAt)}`
        : null;
    return {
      plan: tier,
      current,
      note,
      selectable: plan !== null && endsAt === null && note === null,
    };
  });
}
