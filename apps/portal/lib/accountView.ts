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
 * What that card must not do is *call itself* current. Reported against the live page: right
 * after a downgrade the Pro card read "Current plan" while the heading above it read "Pro
 * until 4 September, then Free", and one of the two had to be wrong. So a plan on its way out
 * carries its end date instead, and the pair reads as the timeline it is — "Ends 4 September"
 * above "Begins 4 September". The styling still marks it, because access today really is
 * Pro's; only the word that outlived the cancellation is gone.
 *
 * Visible is not the same as actionable, and the two states that suppress every button do it
 * for different reasons:
 *
 *   - Scheduled cancellation. `billing.ts` refuses both mechanisms while one is pending —
 *     changePlan answers 409 SCHEDULED_TO_CANCEL on `cancelAtPeriodEnd`, and createCheckout
 *     answers 409 SCHEDULED_TO_CANCEL_CHECKOUT rather than open a second subscription. The one
 *     exception is a repeat request for Free, which changePlan treats as the no-op it is and
 *     answers with a redirect, since that is already where the account is going. So the cards
 *     are shown and none of them is selectable; Resume, above the ladder, is the one action
 *     that leads anywhere. Offering a Switch here would render a button whose only possible
 *     answer is an error page.
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
      ? endsAt
        ? `Ends ${formatDate(endsAt)}`
        : "Current plan"
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
