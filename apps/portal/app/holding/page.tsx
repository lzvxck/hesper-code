import { ComingSoon } from "@seri/ui";

const REPO_URL = "https://github.com/lzvxck/seri-agent";

/*
 * The page proxy.ts rewrites `/`, /billing and /usage to while SERI_COMING_SOON is set, ahead
 * of authkitProxy, so it is the one surface of this app a visitor without a WorkOS session can
 * reach. It reads no environment variable: the flag is decided in middleware and nowhere else,
 * which is what keeps the three real pages and their auth boundary untouched.
 *
 * The accepted consequence is that /holding is reachable directly even with the flag off. It
 * carries no inbound link, and closing it would cost middleware logic running on every request
 * forever to hide a page whose whole existence is temporary — the end state is this PR
 * reverted, not the flag left off.
 */
export default function Holding() {
  return (
    <ComingSoon
      wordmark="Seriora Portal"
      line="Plans and billing for seri."
      repoUrl={REPO_URL}
      builtBy={{ label: "Seriora Research", href: "https://seriora.ai" }}
    />
  );
}
