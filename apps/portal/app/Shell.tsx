import { Button, SiteFooter, SiteNav } from "@seri/ui";
import type { ReactNode } from "react";

import { endSession } from "@/lib/actions";
import { USAGE } from "@/lib/routes";

const REPO_URL = "https://github.com/lzvxck/seri-agent";

/*
 * The chrome every signed-in page carries: who you are and how to leave at the top, where the
 * account is, and what to do next at the bottom. It lives here rather than in page.tsx so the
 * usage page renders inside the same account frame instead of a second copy of it.
 *
 * Sign out is a server action, so it has to stay a form with a real submit — an onClick would
 * need a client component and this file has no other reason to be one.
 */
export function Shell({ email, children }: { email: string; children: ReactNode }) {
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
              <a href={USAGE}>View usage</a>
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
