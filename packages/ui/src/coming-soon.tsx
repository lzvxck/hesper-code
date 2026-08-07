import { SiteFooter } from "./site-footer";

/*
 * The whole body of the holding page the three sites serve while the agent is not available:
 * one wordmark, one heading, one line, and the same footer the real pages carry so the page
 * still offers a real destination. No SiteNav — there is nothing to navigate to.
 *
 * It deliberately does NOT use `Reveal`, and that is a correctness constraint rather than a
 * style preference. `reveal.tsx` initialises `shown` to false, so the server renders
 * `data-reveal="pending"`, which globals.css defines as `opacity: 0`; the thing that restores
 * visibility without JS is `RevealNoScript`, which must render inside <head>, and
 * apps/portal/app/layout.tsx has no <head>. A Reveal-wrapped holding page would therefore be
 * BLANK — not degraded, blank — on the portal for every client without JS: crawlers, link
 * previews, curl. On a page whose entire audience is first-time and automated visitors that is
 * the worst available failure. apps/portal/tests/holding.test.ts asserts the rendered markup
 * carries no data-reveal attribute, so this cannot be undone silently.
 *
 * Being a plain sync server component with no "use client" has a second payoff: the app copy
 * suites can put it through `renderToStaticMarkup`, which throws outright on an async server
 * component and renders nothing for a closed client subtree.
 *
 * The props mirror SiteFooter's exactly, `builtBy` optional for the same reason — the lab's own
 * site would otherwise credit itself.
 *
 * `min-h-[70svh]` is the one arbitrary value here that is not already on an existing page: a
 * three-line page on a tall viewport otherwise floats at the top with the footer stranded
 * mid-screen. No `data-surface="ink"` — the three sites all lead on canvas, and the footer's
 * border-ink-hairline / text-ink-subtle assume it.
 */
export function ComingSoon({
  wordmark,
  line,
  builtBy,
}: {
  wordmark: string;
  line: string;
  builtBy?: { label: string; href: string };
}) {
  return (
    <>
      <main
        id="top"
        className="mx-auto flex min-h-[70svh] max-w-[1080px] flex-col justify-center px-11 py-29 md:px-16 md:py-34"
      >
        <p className="mb-11 font-mono text-ink-subtle uppercase tracking-[1px]">{wordmark}</p>
        <h1 className="max-w-[16ch] text-[38px] leading-[1.1] font-bold tracking-[-1px] md:text-display">
          Coming soon
        </h1>
        <p className="mt-11 max-w-[62ch] text-ink-subtle md:mt-16 md:text-[16px]/[1.4]">{line}</p>
      </main>
      <SiteFooter wordmark={wordmark} builtBy={builtBy} />
    </>
  );
}
