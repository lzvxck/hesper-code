import type { Plan } from "@seri/plans";

/*
 * A change Polar has already accepted and will apply at `at`. Two kinds, and they are not
 * interchangeable — the difference decides what the page may offer.
 *
 * `ends` is a cancellation: `cancel_at_period_end`. Polar refuses every plan change while one
 * is pending (403 AlreadyCanceledSubscription, measured), so the ladder is inert and Resume is
 * the only way out.
 *
 * `changes` is a pending product update: a downgrade, which `next_period` proration schedules
 * rather than applies. Measured against the sandbox, this state blocks nothing — an upgrade
 * applies at once and discards it, another downgrade replaces it, and re-requesting the plan
 * already held clears it. So the ladder stays live, and going back is a plan choice like any
 * other rather than a special control.
 *
 * Both can be true at once: a subscription can carry a pending downgrade *and* be scheduled to
 * cancel. What Polar does at the period end in that case is not measured here — it cannot be
 * without waiting a billing cycle — so the page reports the cancellation, which is the one that
 * ends the account's access, and treats the downgrade as moot.
 */
export type ScheduledChange = { kind: "ends" | "changes"; plan: Plan; at: Date };
