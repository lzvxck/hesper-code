import type { Plan, SubscriptionStatus } from "@seri/plans";
import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Both unions come from @seri/plans, the same module the portal parses this table back
 * through. `plan` used to be a bare `string` here — the single writer of the column having
 * the weakest type of anyone who touches it.
 */
export type AccountStatusUpsertParams = {
  workosUserId: string;
  email: string | null;
  polarCustomerId: string;
  status: SubscriptionStatus;
  plan: Plan | null;
};

export async function upsertAccountStatus(
  supabase: SupabaseClient,
  params: AccountStatusUpsertParams,
): Promise<void> {
  const { error } = await supabase.from("account_status").upsert(
    {
      workos_user_id: params.workosUserId,
      email: params.email,
      polar_customer_id: params.polarCustomerId,
      subscription_status: params.status,
      plan: params.plan,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workos_user_id" },
  );
  if (error) throw error;
}
