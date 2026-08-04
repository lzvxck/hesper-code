import { ArrowRight } from "lucide-react";

import { Button, GitHubMark, Reveal, SiteNav } from "@seri/ui";

const REPO_URL = "https://github.com/lzvxck/seri-agent";
const AGENT_URL = "https://seri-agent.seriora.ai";

const PRODUCTS = [
  {
    name: "seri",
    href: AGENT_URL,
    body: "A coding agent that asks before it writes. Permission is a gate you set, not a judgment the model makes about itself — and a new session starts read-only.",
  },
];

const PRINCIPLES = [
  {
    title: "Legible over clever",
    body: "A tool you can read end to end is one you can trust with your repository. We would rather ship less surface than more magic.",
  },
  {
    title: "Permission is the user's",
    body: "Nothing writes, runs or spends on your behalf until you have said so. The default is always the cautious one.",
  },
  {
    title: "Your keys, your machine",
    body: "Bring your own key and everything runs locally. Hosted accounts exist, but nothing depends on them.",
  },
];

export default function Home() {
  return (
    <>
      <SiteNav
        wordmark="Seriora Research"
        repoUrl={REPO_URL}
        links={[{ label: "Agent", href: AGENT_URL }]}
      />

      <main id="top">
        {/* ---------------------------------------------------------------- Hero */}
        <section className="mx-auto max-w-[1080px] px-11 pt-34 pb-29 md:px-16 md:pt-51 md:pb-34">
          <Reveal>
            <p className="mb-11 font-mono text-ink-subtle uppercase tracking-[1px]">
              An independent research lab
            </p>
            <h1 className="max-w-[16ch] text-[38px] leading-[1.1] font-bold tracking-[-1px] md:text-display">
              Tools you can hand your work to.
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mt-11 max-w-[62ch] text-ink-subtle md:mt-16 md:text-[16px]/[1.4]">
              Seriora Research builds software for working alongside models. Small, legible programs that do
              what you asked, stop where you said, and leave the decisions that matter with you.
            </p>
          </Reveal>
        </section>

        {/* ------------------------------------------------------------ Products */}
        <section className="mx-auto max-w-[1080px] px-11 pb-29 md:px-16 md:pb-34">
          <Reveal>
            <h2 className="text-[34px] leading-[1.1] font-bold tracking-[-0.8px] md:text-[46px]">
              What we build
            </h2>
          </Reveal>

          <ul className="mt-29 grid gap-8 md:mt-34 md:grid-cols-3 md:gap-11">
            {PRODUCTS.map((product, index) => (
              <Reveal
                key={product.name}
                as="li"
                delay={index * 100}
                className="flex h-full flex-col rounded-md border border-ink-hairline bg-canvas p-16 shadow-card md:p-22"
              >
                <code className="font-mono text-mono font-bold">{product.name}</code>
                <p className="mt-11 text-ink-subtle">{product.body}</p>
                <div className="mt-16 flex">
                  <Button asChild variant="outline" size="sm">
                    <a href={product.href}>
                      Open
                      <ArrowRight size={14} aria-hidden="true" />
                    </a>
                  </Button>
                </div>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* ----------------------------------------------------------- Manifesto */}
        <section data-surface="ink" className="bg-ink text-on-ink">
          <div className="mx-auto max-w-[1080px] px-11 py-29 md:px-16 md:py-34">
            <Reveal>
              <h2 className="max-w-[18ch] text-[34px] leading-[1.1] font-bold tracking-[-0.8px] md:text-display">
                How we build.
              </h2>
              <p className="mt-11 max-w-[58ch] text-on-ink-subtle md:mt-16 md:text-[16px]/[1.4]">
                Capability is not the hard part any more. Knowing what a tool will do before you run it is.
                Everything here is built for that.
              </p>
            </Reveal>

            <ul className="mt-29 grid gap-8 md:mt-34 md:grid-cols-3 md:gap-11">
              {PRINCIPLES.map((principle, index) => (
                <Reveal
                  key={principle.title}
                  as="li"
                  delay={index * 100}
                  className="flex h-full flex-col rounded-md border border-on-ink-hairline p-16 md:p-22"
                >
                  <h3 className="text-[16px] leading-[1.3] font-bold tracking-[-0.3px]">{principle.title}</h3>
                  <p className="mt-8 text-on-ink-subtle">{principle.body}</p>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-hairline">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-8 px-11 py-16 md:flex-row md:items-center md:justify-between md:px-16">
          <span className="font-mono text-mono font-bold tracking-[-0.4px]">Seriora Research</span>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-4 text-ink-subtle hover:text-ink"
          >
            <GitHubMark />
            lzvxck/seri-agent
          </a>
        </div>
      </footer>
    </>
  );
}
