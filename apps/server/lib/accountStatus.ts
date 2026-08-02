import type { SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionStatus = "active" | "canceled" | "past_due" | "revoked";

export async function upsertAccountStatus(
  supabase: SupabaseClient,
  params: { workosUserId: string; email: string | null; polarCustomerId: string; status: SubscriptionStatus },
): Promise<void> {
  await supabase.from("account_status").upsert(
    {
      workos_user_id: params.workosUserId,
      email: params.email,
      polar_customer_id: params.polarCustomerId,
      subscription_status: params.status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workos_user_id" },
  );
}
