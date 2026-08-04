import { GitHubMark } from "./github-mark";

/*
 * The link's text is the repo slug, derived from `repoUrl` rather than passed separately, so
 * the slug is written once per site instead of once as a URL and again as a display string
 * that can drift out of sync with it.
 */
export function SiteFooter({ wordmark, repoUrl }: { wordmark: string; repoUrl: string }) {
  return (
    <footer className="border-t border-ink-hairline">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-8 px-11 py-16 md:flex-row md:items-center md:justify-between md:px-16">
        <span className="font-mono text-mono font-bold tracking-[-0.4px]">{wordmark}</span>
        <a href={repoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-4 text-ink-subtle hover:text-ink">
          <GitHubMark />
          {new URL(repoUrl).pathname.slice(1)}
        </a>
      </div>
    </footer>
  );
}
