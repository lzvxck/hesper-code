import { Button } from "./button";
import { GitHubMark } from "./github-mark";

/*
 * The wordmark links to `#top`, so the page that renders this must carry that id.
 * `links` are the site-specific entries; the GitHub link is common to both sites and
 * comes from `repoUrl`.
 */
export function SiteNav({
  wordmark,
  repoUrl,
  links,
}: {
  wordmark: string;
  repoUrl: string;
  links: { label: string; href: string }[];
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-ink-hairline bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1080px] items-center justify-between px-11 py-8 md:px-16">
        <a href="#top" className="font-mono text-mono font-bold tracking-[-0.4px]">
          {wordmark}
        </a>
        <nav className="flex items-center gap-4">
          {links.map((link) => (
            <Button key={link.href} asChild variant="ghost" size="sm">
              <a href={link.href}>{link.label}</a>
            </Button>
          ))}
          <Button asChild variant="ghost" size="sm">
            <a href={repoUrl} target="_blank" rel="noreferrer">
              <GitHubMark />
              GitHub
            </a>
          </Button>
        </nav>
      </div>
    </header>
  );
}
