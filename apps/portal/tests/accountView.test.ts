import { describe, expect, test } from "bun:test";
import { planCards } from "../lib/accountView";

const ENDS_AT = new Date("2026-09-04T00:00:00Z");

// Fixed rather than locale-dependent: the page's own formatter is injected, so this asserts
// the note's shape without asserting anything about the runtime's Intl data.
const formatDate = () => "4 September";

function byPlan(cards: ReturnType<typeof planCards>) {
  return Object.fromEntries(cards.map((card) => [card.plan, card]));
}

/*
 * The ladder is the page's only orientation device: it says what exists, what it costs and
 * where the account is standing among it. Every state renders all four cards for that reason,
 * so each of these first asserts the four are present before asserting anything about them.
 */
describe("planCards", () => {
  test("renders the whole ladder in ascending order in every state", () => {
    for (const cards of [
      planCards("free", null, formatDate),
      planCards("pro", ENDS_AT, formatDate),
      planCards(null, null, formatDate),
    ]) {
      expect(cards.map((card) => card.plan)).toEqual(["free", "pro", "max", "ultra"]);
    }
  });

  test("marks the held plan current and offers every other one", () => {
    const cards = byPlan(planCards("pro", null, formatDate));

    expect(cards.pro).toMatchObject({ current: true, note: "Current plan", selectable: false });
    // Free included: going back down is a real move, and changePlan treats it as a
    // cancellation at period end rather than a checkout.
    for (const plan of ["free", "max", "ultra"] as const) {
      expect(cards[plan]).toMatchObject({ current: false, note: null, selectable: true });
    }
  });

  /*
   * The reported bug, at the level where it was decided. The old page returned early on
   * `endsAt` and rendered a banner *instead of* the ladder.
   */
  describe("scheduled to cancel", () => {
    test("keeps the paid plan current — Free is where the account arrives, not where it is", () => {
      const cards = byPlan(planCards("pro", ENDS_AT, formatDate));

      expect(cards.pro).toMatchObject({ current: true, note: "Current plan" });
      expect(cards.free).toMatchObject({ current: false, note: "Begins 4 September" });
    });

    /*
     * Visible but inert, and this is the assertion that has to hold: billing.ts refuses both
     * mechanisms while a cancellation is pending — changePlan answers 409 on
     * `cancelAtPeriodEnd`, createCheckout answers 409 rather than open a second subscription.
     * A selectable Max or Ultra here is a button whose only possible answer is an error.
     */
    test("offers no switch at all, because every one of them would 409", () => {
      const cards = planCards("pro", ENDS_AT, formatDate);

      expect(cards.filter((card) => card.selectable)).toEqual([]);
    });
  });

  /*
   * The retired-product case: an active subscription on a product this deployment has no
   * mapping for. Nothing is current, because nothing on the ladder is what they hold.
   */
  test("shows the ladder but offers nothing when the plan is unrecognized", () => {
    const cards = planCards(null, null, formatDate);

    expect(cards.filter((card) => card.current || card.selectable)).toEqual([]);
    expect(cards.map((card) => card.note)).toEqual([null, null, null, null]);
  });
});
