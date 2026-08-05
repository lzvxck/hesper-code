import { describe, expect, test } from "bun:test";
import { planCards } from "../lib/accountView";
import type { ScheduledChange } from "../lib/scheduled";

const AT = new Date("2026-09-04T00:00:00Z");

// Fixed rather than locale-dependent: the page's own formatter is injected, so this asserts
// the label's shape without asserting anything about the runtime's Intl data.
const formatDate = () => "4 September";

const ENDS: ScheduledChange = { kind: "ends", plan: "free", at: AT };
const CHANGES: ScheduledChange = { kind: "changes", plan: "pro", at: AT };

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
      planCards("pro", ENDS, formatDate),
      planCards("max", CHANGES, formatDate),
      planCards(null, null, formatDate),
    ]) {
      expect(cards.map((card) => card.plan)).toEqual(["free", "pro", "max", "ultra"]);
    }
  });

  test("marks the held plan current and offers every other one", () => {
    const cards = byPlan(planCards("pro", null, formatDate));

    expect(cards.pro).toMatchObject({ current: true, label: "Current plan", selectable: false });
    // Free included: going back down is a real move, and changePlan treats it as a
    // cancellation at period end rather than a checkout.
    for (const plan of ["free", "max", "ultra"] as const) {
      expect(cards[plan]).toMatchObject({ current: false, label: "Choose plan", selectable: true });
    }
  });

  /*
   * A cancellation. Polar refuses every switch while one is pending (403, measured), so the
   * cards are readable and none of them is actionable — a Switch here would be a button whose
   * only possible answer is an error page.
   */
  describe("scheduled to end", () => {
    test("keeps the paid plan current — Free is where the account arrives, not where it is", () => {
      const cards = byPlan(planCards("pro", ENDS, formatDate));

      expect(cards.pro.current).toBe(true);
      expect(cards.free.current).toBe(false);
    });

    test("dates both ends of the move instead of calling the outgoing plan current", () => {
      const cards = byPlan(planCards("pro", ENDS, formatDate));

      expect(cards.pro.label).toBe("Ends 4 September");
      expect(cards.free.label).toBe("Begins 4 September");
    });

    test("offers no switch at all, because every one of them would 409", () => {
      expect(planCards("pro", ENDS, formatDate).filter((card) => card.selectable)).toEqual([]);
    });
  });

  /*
   * A booked downgrade, which is a different state and was rendered as no state at all: the
   * page showed "You're on Max" and the customer's click looked lost. Polar blocks nothing
   * here — an upgrade applies at once, another downgrade replaces the booking, and asking for
   * the plan already held clears it — so this ladder stays live.
   */
  describe("scheduled to change", () => {
    test("names both ends of the move, and keeps the held plan current until then", () => {
      const cards = byPlan(planCards("max", CHANGES, formatDate));

      expect(cards.max.current).toBe(true);
      expect(cards.pro).toMatchObject({ current: false, label: "Begins 4 September" });
    });

    /*
     * The way back. Re-requesting the held plan is what calls a booked downgrade off, so the
     * card that would otherwise read "Current plan" becomes a choice again — without it a
     * customer who downgraded by mistake could only escape by paying for an upgrade.
     */
    test("makes the held plan choosable again, which is how the change is called off", () => {
      const cards = byPlan(planCards("max", CHANGES, formatDate));

      expect(cards.max).toMatchObject({ label: "Keep this plan", selectable: true });
    });

    test("leaves the rest of the ladder live, unlike a cancellation", () => {
      const cards = byPlan(planCards("max", CHANGES, formatDate));

      expect(cards.free).toMatchObject({ label: "Choose plan", selectable: true });
      expect(cards.ultra).toMatchObject({ label: "Choose plan", selectable: true });
    });

    // The destination is where the account is already going, so choosing it again would ask
    // Polar for the booking it already holds.
    test("does not offer the plan the account is already moving to", () => {
      expect(byPlan(planCards("max", CHANGES, formatDate)).pro.selectable).toBe(false);
    });
  });

  /*
   * The retired-product case: an active subscription on a product this deployment has no
   * mapping for. Nothing is current, because nothing on the ladder is what they hold.
   */
  test("shows the ladder but offers nothing when the plan is unrecognized", () => {
    const cards = planCards(null, null, formatDate);

    expect(cards.filter((card) => card.current || card.selectable)).toEqual([]);
    expect(cards.map((card) => card.label)).toEqual(Array(4).fill("Choose plan"));
  });
});
