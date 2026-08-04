import { ArrowRight, Blocks, FileCode, History, Key, Layers, ShieldCheck } from "lucide-react";

import { Button, GitHubMark, Reveal, SiteNav } from "@seri/ui";

import { InstallTabs } from "@/components/InstallTabs";

const REPO_URL = "https://github.com/lzvxck/seri-agent";

const MODES = [
  {
    name: "read-only",
    tag: "default",
    description: "Reads, greps and globs. Cannot write a file or run a command, at all.",
  },
  {
    name: "approve-each",
    tag: null,
    description: "Every write and every command stops and asks you first. Nothing runs unanswered.",
  },
  {
    name: "auto",
    tag: null,
    description: "Runs unattended once you've decided the task is worth it. Your call, not the model's.",
  },
];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Gate-first, not sandboxed",
    body: "The SDK's automatic tool execution is switched off. The loop calls each tool itself, only after the gate has decided it's allowed to run.",
  },
  {
    icon: Blocks,
    title: "Tools are pure functions",
    body: "read_file, write_file, edit, grep, glob, bash and powershell. Each one is testable on its own, with no model in the loop.",
  },
  {
    icon: FileCode,
    title: "Edits that don't overreach",
    body: "A three-tier match cascade — exact, line-trimmed, then whitespace-normalized — with a guard against replacing far more than you asked.",
  },
  {
    icon: History,
    title: "Sessions that resume",
    body: "Every session persists as JSON on disk. --resume picks up the most recent one, or any session by id.",
  },
  {
    icon: Layers,
    title: "Compaction that stays valid",
    body: "Past a share of the context window, evicted turns collapse into goal, progress, blockers and next steps — never splitting a tool call from its result.",
  },
  {
    icon: Key,
    title: "Your key, your machine",
    body: "Bring your own API key. It's stored owner-only, written atomically, and read from your environment first. Hosted accounts stay optional.",
  },
];

const PLATFORMS = [
  { os: "macOS", arch: "Intel (x64), Apple Silicon (arm64)" },
  { os: "Linux", arch: "x64, arm64" },
  { os: "Windows", arch: "x64" },
];

export default function Home() {
  return (
    <>
      <SiteNav wordmark="seri" repoUrl={REPO_URL} links={[{ label: "Install", href: "#install" }]} />

      <main id="top">
        {/* ---------------------------------------------------------------- Hero */}
        <section className="mx-auto max-w-[1080px] px-11 pt-34 pb-29 md:px-16 md:pt-51 md:pb-34">
          <Reveal>
            <p className="mb-11 font-mono text-ink-subtle uppercase tracking-[1px]">
              Cross-platform · Bring your own key
            </p>
            <h1 className="max-w-[16ch] text-[38px] leading-[1.1] font-bold tracking-[-1px] md:text-display">
              A coding agent that asks before it writes.
            </h1>
          </Reveal>

          <Reveal delay={120}>
            <p className="mt-11 max-w-[62ch] text-ink-subtle md:mt-16 md:text-[16px]/[1.4]">
              seri is a coding CLI built around a permission gate rather than a sandbox. Every write, every
              command and every edit has to clear a mode you set — and a brand-new session starts read-only, so
              nothing touches your repository until you say so.
            </p>
          </Reveal>

          <Reveal delay={240}>
            {/* Full container width on purpose — the curl command is ~95 characters and
                gets visually truncated in anything narrower. */}
            <div id="install" className="mt-29 scroll-mt-34 md:mt-34">
              <InstallTabs />
            </div>
          </Reveal>

          <Reveal delay={360}>
            <div className="mt-16 flex flex-wrap items-center gap-8">
              <Button asChild>
                <a href="#after-install">
                  Get set up
                  <ArrowRight size={14} aria-hidden="true" />
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={REPO_URL} target="_blank" rel="noreferrer">
                  <GitHubMark />
                  View the source
                </a>
              </Button>
            </div>
          </Reveal>
        </section>

        {/* --------------------------------------------------------------- Modes */}
        <section data-surface="ink" className="bg-ink text-on-ink">
          <div className="mx-auto max-w-[1080px] px-11 py-29 md:px-16 md:py-34">
            <Reveal>
              <h2 className="max-w-[18ch] text-[34px] leading-[1.1] font-bold tracking-[-0.8px] md:text-display">
                Three modes. One of them is the default.
              </h2>
              <p className="mt-11 max-w-[58ch] text-on-ink-subtle md:mt-16 md:text-[16px]/[1.4]">
                Permission isn't a judgment the model makes about itself. Whether a tool can write is derived
                from a single list in the source tree, and the mode you're in decides what happens next. Cycle
                it any time with <code className="font-mono text-on-ink">/mode</code>.
              </p>
            </Reveal>

            <ul className="mt-29 grid gap-8 md:mt-34 md:grid-cols-3 md:gap-11">
              {MODES.map((mode, index) => (
                <Reveal
                  key={mode.name}
                  as="li"
                  delay={index * 100}
                  className="flex h-full flex-col rounded-md border border-on-ink-hairline p-16 md:p-22"
                >
                  <div className="flex items-center gap-6">
                    <code className="font-mono text-mono font-bold text-on-ink">{mode.name}</code>
                    {mode.tag ? (
                      <span className="rounded-sm bg-on-ink px-6 py-2 font-mono text-ink uppercase tracking-[0.5px]">
                        {mode.tag}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-8 text-on-ink-subtle">{mode.description}</p>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------------------ Features */}
        <section className="mx-auto max-w-[1080px] px-11 py-29 md:px-16 md:py-34">
          <Reveal>
            <h2 className="max-w-[16ch] text-[34px] leading-[1.1] font-bold tracking-[-0.8px] md:text-display">
              Built to be predictable.
            </h2>
          </Reveal>

          <ul className="mt-29 grid gap-8 md:mt-34 md:grid-cols-3 md:gap-11">
            {FEATURES.map((feature, index) => (
              <Reveal
                key={feature.title}
                as="li"
                delay={(index % 3) * 100}
                className="flex h-full flex-col rounded-md border border-ink-hairline bg-canvas p-16 shadow-card md:p-22"
              >
                <feature.icon size={20} strokeWidth={1.5} aria-hidden="true" />
                <h3 className="mt-11 text-[16px] leading-[1.3] font-bold tracking-[-0.3px]">{feature.title}</h3>
                <p className="mt-6 text-ink-subtle">{feature.body}</p>
              </Reveal>
            ))}
          </ul>
        </section>

        {/* -------------------------------------------------------- After install */}
        <section
          id="after-install"
          className="mx-auto max-w-[1080px] scroll-mt-34 px-11 pb-29 md:px-16 md:pb-34"
        >
          <div className="rounded-lg border border-ink-hairline bg-canvas p-16 shadow-card md:p-34">
            <Reveal>
              <h2 className="max-w-[16ch] text-[34px] leading-[1.1] font-bold tracking-[-0.8px] md:text-[46px]">
                Then three commands.
              </h2>
            </Reveal>

            {/* Stacked rather than a 3-up grid: at a third of the container these commands
                truncate, and sequential steps read better down the page than across it. */}
            <ol className="mt-29 flex flex-col gap-16 md:mt-34">
              {[
                {
                  step: "01",
                  command: "seri --version",
                  caption: "Confirm the binary is on your PATH.",
                },
                {
                  step: "02",
                  command: "seri config set GROQ_API_KEY <your-key>",
                  caption: "Stored owner-only on your machine. An environment variable wins over it.",
                },
                {
                  step: "03",
                  command: "seri login",
                  caption: "Optional — only if you want a hosted account. The BYOK path never needs it.",
                },
              ].map((item, index) => (
                <Reveal
                  key={item.step}
                  as="li"
                  delay={index * 100}
                  className="flex flex-col gap-8 border-b border-ink-hairline pb-16 last:border-0 last:pb-0 md:flex-row md:items-center md:gap-16"
                >
                  <span className="shrink-0 font-mono text-ink-subtle tracking-[1px]">{item.step}</span>
                  <code className="overflow-x-auto rounded-sm border border-ink-hairline px-8 py-8 font-mono text-mono whitespace-pre md:shrink-0">
                    {item.command}
                  </code>
                  <p className="text-ink-subtle">{item.caption}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ----------------------------------------------------------- Platforms */}
        <section className="mx-auto max-w-[1080px] px-11 pb-29 md:px-16 md:pb-34">
          <Reveal>
            <h2 className="text-[34px] leading-[1.1] font-bold tracking-[-0.8px] md:text-[46px]">
              Supported platforms
            </h2>
            <p className="mt-11 max-w-[58ch] text-ink-subtle md:text-[16px]/[1.4]">
              One script detects your OS and CPU architecture and downloads the matching binary. Windows gets a
              real PowerShell, not a translation layer.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div className="mt-16 overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-ink">
                    <th scope="col" className="py-8 pr-11 font-mono font-normal uppercase tracking-[1px]">
                      OS
                    </th>
                    <th scope="col" className="py-8 font-mono font-normal uppercase tracking-[1px]">
                      Architectures
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {PLATFORMS.map((platform) => (
                    <tr key={platform.os} className="border-b border-ink-hairline">
                      <th scope="row" className="py-11 pr-11 font-bold whitespace-nowrap">
                        {platform.os}
                      </th>
                      <td className="py-11 text-ink-subtle">{platform.arch}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </section>

        {/* --------------------------------------------------------- Closing CTA */}
        <section data-surface="ink" className="bg-ink text-on-ink">
          <div className="mx-auto max-w-[1080px] px-11 py-34 text-center md:px-16 md:py-51">
            <Reveal>
              <h2 className="mx-auto max-w-[18ch] text-[34px] leading-[1.1] font-bold tracking-[-0.8px] md:text-display">
                Start in read-only. Decide from there.
              </h2>
              <p className="mx-auto mt-11 max-w-[52ch] text-on-ink-subtle md:mt-16 md:text-[16px]/[1.4]">
                One command to install, and nothing writes to your repository until you hand it permission.
              </p>
              <div className="mt-29 flex flex-wrap justify-center gap-8">
                <Button asChild variant="onInk">
                  <a href="#install">
                    Install seri
                    <ArrowRight size={14} aria-hidden="true" />
                  </a>
                </Button>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-hairline">
        <div className="mx-auto flex max-w-[1080px] flex-col gap-8 px-11 py-16 md:flex-row md:items-center md:justify-between md:px-16">
          <span className="font-mono text-mono font-bold tracking-[-0.4px]">seri</span>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-4 text-ink-subtle hover:text-ink">
            <GitHubMark />
            lzvxck/seri-agent
          </a>
        </div>
      </footer>
    </>
  );
}
