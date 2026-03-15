/**
 * ReportMarkdown
 *
 * A wrapper around <Streamdown> that customizes link rendering:
 * - Links whose href contains "?q=" are search-page fallbacks.
 *   They get a small "搜索页" badge so the reader knows it's a fallback.
 * - All other links open in a new tab as normal.
 */

import { Streamdown } from "streamdown";
import { ExternalLink, Search } from "lucide-react";

interface ReportMarkdownProps {
  children: string;
  className?: string;
}

/** Detect whether a URL is a search-page fallback */
function isSearchPage(href: string): boolean {
  try {
    const url = new URL(href);
    return url.searchParams.has("q");
  } catch {
    // Relative URLs or malformed – check naively
    return href.includes("?q=") || href.includes("&q=");
  }
}

/** Custom link renderer injected into Streamdown via `components` */
function CustomLink({
  href,
  children,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const url = href ?? "";
  const isSearch = isSearchPage(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-baseline gap-1 group"
      {...rest}
    >
      <span className="underline underline-offset-2 decoration-primary/60 group-hover:decoration-primary transition-colors">
        {children}
      </span>
      {isSearch ? (
        <span
          className="inline-flex items-center gap-0.5 px-1 py-0 text-[10px] font-medium leading-4 rounded
                     bg-amber-100 text-amber-700 border border-amber-300/60
                     dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700/40
                     align-middle shrink-0 ml-0.5"
          title="此链接指向搜索结果页，是系统自动生成的备用链接"
        >
          <Search className="h-2.5 w-2.5" />
          搜索页
        </span>
      ) : (
        <ExternalLink className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary/60 transition-colors shrink-0 self-center" />
      )}
    </a>
  );
}

const COMPONENTS = {
  a: CustomLink,
};

export function ReportMarkdown({ children, className }: ReportMarkdownProps) {
  return (
    <Streamdown components={COMPONENTS} className={className}>
      {children}
    </Streamdown>
  );
}
