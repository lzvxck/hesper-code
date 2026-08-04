import { Button, SiteFooter, SiteNav } from "@seri/ui";
import { signOut } from "@workos-inc/authkit-nextjs";

import { getPolarClient } from "@/lib/polar";
import { ensureProvisioned } from "@/lib/provisioning";
import { getSessionUser } from "@/lib/session";
import { getSupabaseClient } from "@/lib/supabase";

const REPO_URL = "https://github.com/lzvxck/seri-agent";

// Included spend is 75% of list price across the ladder — see docs-tmp/pricing-tiers.md.
const TIERS = [
  { plan: "pro", name: "Pro", price: "$20", included: "$15" },
  { plan: "max", name: "Max", price: "$100", included: "$75" },
  { plan: "ultra", name: "Ultra", price: "$200", included: "$150" },
];

export default async function AccountPage() {
  const user = await getSessionUser();
  const plan = await ensureProvisioned(
    { supabase: getSupabaseClient(), polar: getPolarClient(), products: process.env },
    user,
  );

  // Free -> paid must go through a checkout, because the free subscription never took a
  // card. An unrecognized product is treated the same way: checkout cannot 402.
  const action = plan === "free" || plan === null ? "/api/checkout" : "/api/plan";

  async function endSession() {
    "use server";
    await signOut();
  }

  return (
    <>
      <SiteNav wordmark="seri" repoUrl={REPO_URL} links={[]} />

      <main id="top">
        <section className="mx-auto max-w-[1080px] px-11 pt-34 pb-29 md:px-16 md:pt-51 md:pb-34">
          <p className="mb-11 font-mono text-ink-subtle uppercase tracking-[1px]">{user.email}</p>
          <h1 className="text-[38px] leading-[1.1] font-bold tracking-[-1px] md:text-display">
            {plan ? `You're on ${plan}.` : "Your plan isn't recognized."}
          </h1>
          <p className="mt-11 max-w-[62ch] text-ink-subtle md:mt-16 md:text-[16px]/[1.4]">
            Bring your own key stays free forever and needs no account at all. These plans exist for the
            hosted option, where seri manages the keys and you pay for the upstream usage you actually make.
          </p>

          <div className="mt-29 grid gap-11 md:mt-34 md:grid-cols-3">
            {TIERS.map((tier) => (
              <div key={tier.plan} className="border border-ink-hairline p-11">
                <h2 className="font-mono text-mono font-bold tracking-[-0.4px]">{tier.name}</h2>
                <p className="mt-8 text-[28px] leading-[1.1] font-bold tracking-[-0.8px]">
                  {tier.price}
                  <span className="text-ink-subtle text-body font-normal">/mo</span>
                </p>
                <p className="mt-8 text-ink-subtle">{tier.included}/mo of included usage</p>
                <form action={action} method="post" className="mt-11">
                  <input type="hidden" name="plan" value={tier.plan} />
                  <Button type="submit" disabled={plan === tier.plan}>
                    {plan === tier.plan ? "Current plan" : `Switch to ${tier.name}`}
                  </Button>
                </form>
              </div>
            ))}
          </div>

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
