import { Fragment } from "react";

/*
 * The learning loop as a diagram: five labelled nodes joined by hairline connectors.
 *
 * The connectors are inline SVG stroked with `currentColor`, and each <svg> carries
 * text-on-ink-subtle — so they take the subtle token rather than the surface's own text
 * colour, which would draw them full-white and louder than the nodes they join. Nothing here
 * animates: there is no transition or keyframe to suppress under prefers-reduced-motion. The
 * nodes are text rather than <text> inside one fixed viewBox so the row can reflow into a
 * column at the single 768px breakpoint.
 *
 * aria-hidden because the four cards below it are the same four facts in prose: a screen
 * reader that also read the nodes would hear the sequence twice, and nothing on this
 * surface is conveyed by the graphic alone.
 */
const STEPS = ["session", "review", "staged", "you approve", "next session"];

export function LearningLoop() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col items-center gap-6 md:flex-row md:justify-between md:gap-8"
    >
      {STEPS.map((step, index) => (
        <Fragment key={step}>
          {index > 0 ? (
            <svg
              viewBox="0 0 24 8"
              width="24"
              height="8"
              className="shrink-0 rotate-90 text-on-ink-subtle md:rotate-0"
            >
              <path d="M0 4h21M18 1l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          ) : null}
          <span className="rounded-sm border border-on-ink-hairline px-8 py-6 font-mono whitespace-nowrap">
            {step}
          </span>
        </Fragment>
      ))}
    </div>
  );
}
