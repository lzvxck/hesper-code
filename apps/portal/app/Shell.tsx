import { Button, SiteFooter, SiteNav } from "@seri/ui";
import type { ReactNode } from "react";

import { endSession } from "@/lib/actions";
import { PLANS, USAGE } from "@/lib/routes";

const REPO_URL = "https://github.com/lzvxck/seri-agent";

/*
 * The frame both signed-in pages share: who you are and how to leave at the top, what to do
 * next at the bottom. A module rather than a local in page.tsx so /usage renders inside the
 * same account chrome instead of a second copy of it.
 *
 * Sign out has to stay a form around endSession, which is a server action: bind it to
 * anything else and the compiled form gets a plain URL and nothing signs out. An onClick is
 * not the alternative — it would make this a client component, which nothing else here needs.
 */
export function Shell({
  email,
  current,
  children,
}: {
  email: string;
  current: "account" | "usage";
  children: ReactNode;
}) {
  /*
   * The control row offers the page you are not on. Without this /usage was a dead end: its
   * only two controls were a "View usage" button pointing at itself and Polar's billing
   * portal, and the wordmark is an in-page anchor, so nothing on it reached the plans again.
   *
   * Passed rather than detected — usePathname would make this a client component, and both
   * call sites are the pages themselves.
   */
  const elsewhere =
    current === "account" ? { href: USAGE, label: "View usage" } : { href: PLANS, label: "Back to plans" };

  return (
    <>
      <SiteNav wordmark="seri" repoUrl={REPO_URL} links={[]} />

      <main id="top">
        <section className="mx-auto max-w-[1080px] px-11 pt-34 pb-29 md:px-16 md:pt-51 md:pb-34">
          <div className="mb-11 flex flex-wrap items-center gap-8 md:mb-16 md:justify-end">
            <p className="font-mono text-ink-subtle uppercase tracking-[1px]">{`Signed in as ${email}`}</p>
            <form action={endSession}>
              <Button type="submit" variant="ghost">
                Sign out
              </Button>
            </form>
          </div>

          {children}

          <div className="mt-29 flex flex-wrap items-center gap-8 md:mt-34">
            <Button asChild variant="outline">
              <a href={elsewhere.href}>{elsewhere.label}</a>
            </Button>
            <Button asChild variant="ghost">
              {/* Invoices, receipts, payment method and cancellation all live in Polar. */}
              <a href="/api/portal">Manage billing</a>
            </Button>
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
