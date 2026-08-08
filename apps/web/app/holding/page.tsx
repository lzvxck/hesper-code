import { ComingSoon } from "@seri/ui";

import { WaitlistForm } from "@/components/WaitlistForm";

/*
 * The page proxy.ts rewrites `/` to while SERI_COMING_SOON is set. It reads no environment
 * variable, and that is load-bearing rather than incidental: this route is statically
 * prerendered, so a notFound()-when-off guard inside it would bake the build-time value into
 * the prerendered output and answer the runtime rewrite with a 404. The flag lives in
 * middleware and nowhere else.
 *
 * The accepted consequence is that /holding is reachable directly even with the flag off. It
 * carries no inbound link, and closing it would cost middleware logic running on every request
 * forever to hide a page whose whole existence is temporary — the end state is this PR
 * reverted, not the flag left off.
 *
 * The wrapper below neutralises <ComingSoon>'s min-h-[100svh] ([&>main]:min-h-0
 * [&>main]:flex-1 on a min-h-[100svh] wrapper) so the waitlist form lands inside the first
 * viewport instead of below the fold. body:has(.holding) still matches through the wrapper —
 * that selector reaches <ComingSoon>'s own <main class="holding">, unaffected by what wraps it.
 */
export default function Holding() {
  return (
    <div className="flex min-h-[100svh] flex-col [&>main]:min-h-0 [&>main]:flex-1">
      <ComingSoon wordmark="Seriora" line="seri — a coding agent that learns from its own work." />
      <WaitlistForm />
    </div>
  );
}
