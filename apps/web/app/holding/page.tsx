import { ComingSoon } from "@seri/ui";

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
 */
export default function Holding() {
  return (
    <ComingSoon
      wordmark="seri"
      line="A coding agent that learns from its own work."
      builtBy={{ label: "Seriora Research", href: "https://seriora.ai" }}
    />
  );
}
